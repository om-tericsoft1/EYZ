import asyncio
import os
import subprocess
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, Set
import threading
import time
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware

from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from google import genai
from google.genai import types
import google.genai as genai
import cv2
import uvicorn
from typing import List
import uuid
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Config
class Config:
    RTSP_URL = "rtsp://admin:theimm0rtaL-007@49.206.192.115:5557/media/video2"
    CHUNK_DURATION = 300
    MAX_CHUNKS = 10
    CHUNKS_DIR = "chunks"
    FRAMES_DIR = "frames" 
    RESULTS_DIR = "results"
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "your-gemini-api-key-here")

# Models
class AskRequest(BaseModel):
    question: str
    time: str = "last"

class AskResponse(BaseModel):
    answer: str
    video: str
    screenshot: str
    timestamp: str
    question: str

class Video(BaseModel):
    id: str
    name: str
    path: str
    created_at: datetime

class RealTimeAlert(BaseModel):
    id: Optional[str] = None
    video_id: str
    alert_description: str
    interval_seconds: int = 10  # NEW: Default 10 seconds
    is_active: bool = True
    last_check: Optional[datetime] = None
    created_at: Optional[datetime] = None

class AlertTrigger(BaseModel):
    alert_id: str
    detected: bool
    confidence: float
    snapshot_path: str
    timestamp: datetime
    details: str


# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending to client: {e}")
                disconnected.add(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            self.active_connections.discard(conn)

manager = ConnectionManager()

# RTSP Handler with WebSocket notifications
class RTSPStreamHandler:
    _lock = threading.Lock()  # ✅ Class-level lock
    _active_captures = 0  # ✅ Track active FFmpeg processes
    
    def __init__(self, connection_manager: ConnectionManager):
        self.is_running = False
        self.thread = None
        self.manager = connection_manager
        
    def start_streaming(self):
        if not self.is_running:
            self.is_running = True
            self.thread = threading.Thread(target=self._stream_loop, daemon=True)
            self.thread.start()
            logger.info("RTSP streaming started")
    
    def stop_streaming(self):
        self.is_running = False
        
    def _stream_loop(self):
        while self.is_running:
            try:
                # ✅ Wait if another thread is capturing
                while RTSPStreamHandler._active_captures > 0:
                    logger.info("⏸️  Waiting for other capture to finish...")
                    time.sleep(2)
                    if not self.is_running:
                        return
                
                with RTSPStreamHandler._lock:
                    RTSPStreamHandler._active_captures += 1
                
                timestamp = datetime.now()
                temp_file = os.path.join(Config.CHUNKS_DIR, f"temp_{timestamp.strftime('%Y%m%d_%H%M%S')}.mp4")
                chunk_file = os.path.join(Config.CHUNKS_DIR, f"{timestamp.strftime('%Y%m%d_%H%M%S')}.mp4")

                logger.info(f"🎬 Main RTSP: Starting chunk capture at {timestamp.strftime('%H:%M:%S')}")
                
                cmd = ['ffmpeg', '-i', Config.RTSP_URL, '-c:v', 'libx264', '-c:a', 'aac', 
                       '-t', str(Config.CHUNK_DURATION), '-y', temp_file]
                
                result = subprocess.run(cmd, capture_output=True, timeout=Config.CHUNK_DURATION + 10)
                
                if result.returncode == 0 and os.path.exists(temp_file):
                    file_size = os.path.getsize(temp_file)
                    if file_size > 100000:
                        os.rename(temp_file, chunk_file)
                        logger.info(f"✅ Main RTSP: Chunk saved ({file_size / (1024*1024):.2f} MB)")
                        asyncio.run(self._notify_new_chunk(chunk_file, file_size, timestamp))
                        self._cleanup_old_chunks()
                    else:
                        os.remove(temp_file)
                        
            except Exception as e:
                logger.error(f"Main RTSP error: {e}")
                time.sleep(5)
            finally:
                with RTSPStreamHandler._lock:
                    RTSPStreamHandler._active_captures -= 1
    
    async def _notify_new_chunk(self, filepath: str, size: int, created: datetime):
        message = {
            "type": "new_chunk",
            "data": {
                "filename": os.path.basename(filepath),
                "size": size,
                "created": created.isoformat()
            }
        }
        await self.manager.broadcast(message)
    
    def _cleanup_old_chunks(self):
        chunks = sorted(Path(Config.CHUNKS_DIR).glob("*.mp4"), key=lambda x: x.stat().st_mtime)
        while len(chunks) > Config.MAX_CHUNKS:
            chunks.pop(0).unlink()
# ... (Keep all other classes unchanged: ChunkManager, VideoProcessor, GeminiAnalyzer, ResultStorage)

# Chunk Manager
class ChunkManager:
    @staticmethod
    def get_latest_chunk() -> Optional[str]:
        chunks_dir = Path(Config.CHUNKS_DIR)
        if not chunks_dir.exists():
            return None
        
        chunks = sorted(chunks_dir.glob("*.mp4"), key=lambda x: x.stat().st_mtime, reverse=True)
        
        for chunk in chunks:
            # ✅ Skip files modified in the last 3 seconds (might still be writing)
            age = time.time() - chunk.stat().st_mtime
            if age < 3:
                logger.info(f"Skipping recent file: {chunk.name} (age: {age:.1f}s)")
                continue
                
            # ✅ Skip small files
            if chunk.stat().st_size < 100000:
                logger.info(f"Skipping small file: {chunk.name}")
                continue
                
            # ✅ Verify file is readable
            if ChunkManager._is_readable(str(chunk)):
                return str(chunk)
        
        return None

    
    @staticmethod
    def get_chunk_by_time(target_time: str) -> Optional[str]:
        try:
            target_dt = datetime.fromisoformat(target_time.replace('Z', '+00:00'))
            chunks_dir = Path(Config.CHUNKS_DIR)
            chunks = list(chunks_dir.glob("*.mp4"))
            
            closest = None
            min_diff = float('inf')
            
            for chunk in chunks:
                try:
                    chunk_dt = datetime.strptime(chunk.stem, '%Y%m%d_%H%M%S')
                    diff = abs((target_dt - chunk_dt).total_seconds())
                    if diff < min_diff:
                        min_diff = diff
                        closest = chunk
                except ValueError:
                    continue
            
            return str(closest) if closest else None
        except:
            return None
    
    @staticmethod
    def _is_readable(path: str) -> bool:
        try:
            cap = cv2.VideoCapture(path)
            ret = cap.isOpened() and cap.read()[0]
            cap.release()
            return ret
        except:
            return False

# Video Processor
class VideoProcessor:
    @staticmethod
    def extract_screenshot(video_path: str) -> str:
        os.makedirs(Config.FRAMES_DIR, exist_ok=True)
        screenshot_path = os.path.join(Config.FRAMES_DIR, f"{Path(video_path).stem}.jpg")
        
        for attempt in range(2):
            try:
                cap = cv2.VideoCapture(video_path)
                if cap.isOpened():
                    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                    cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, total_frames // 2))
                    ret, frame = cap.read()
                    if ret:
                        cv2.imwrite(screenshot_path, frame)
                        cap.release()
                        return screenshot_path
                cap.release()
                time.sleep(1)
            except Exception as e:
                if attempt == 1:
                    raise Exception(f"Screenshot extraction failed: {e}")
        
        return screenshot_path

# Gemini Analyzer
class GeminiAnalyzer:
    def __init__(self):
        self.client = genai.Client(api_key=Config.GEMINI_API_KEY)
        
    # ADD THIS METHOD
    def _clean_json_response(self, response: str) -> str:
        """Clean up Gemini response to extract valid JSON"""
        try:
            # Remove markdown code blocks
            if '```json' in response:
                start = response.find('```json') + 7
                end = response.find('```', start)
                if end != -1:
                    response = response[start:end]
            elif '```' in response:
                start = response.find('```') + 3  
                end = response.find('```', start)
                if end != -1:
                    response = response[start:end]
            
            # Strip whitespace
            response = response.strip()
            
            # Try to parse to validate
            json.loads(response)
            return response
            
        except json.JSONDecodeError:
            # If parsing fails, try to extract JSON from the text
            import re
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response, re.DOTALL)
            if json_match:
                potential_json = json_match.group(0)
                try:
                    json.loads(potential_json)
                    return potential_json
                except:
                    pass
            
            # Fallback: return a proper error JSON  
            return json.dumps({
                "answer": "Failed to parse response",
                "detected": False,
                "confidence": 0.0,
                "summary": "JSON parsing error"
            })

        
    def _create_content(self, video_path: str = None, screenshot_path: str = None, question: str = ""):
        contents = []
        
        first_parts = []
        if video_path and os.path.exists(video_path):
            file_size = os.path.getsize(video_path)
            if file_size > 20 * 1024 * 1024:
                logger.warning(f"Video file too large: {file_size} bytes")
            else:
                with open(video_path, 'rb') as f:
                    first_parts.append(types.Part.from_bytes(mime_type="video/mp4", data=f.read()))
                    
        if screenshot_path and os.path.exists(screenshot_path):
            file_size = os.path.getsize(screenshot_path)
            if file_size > 4 * 1024 * 1024:
                logger.warning(f"Image file too large: {file_size} bytes")
            else:
                with open(screenshot_path, 'rb') as f:
                    first_parts.append(types.Part.from_bytes(mime_type="image/jpeg", data=f.read()))
        
        if first_parts:
            contents.append(types.Content(role="user", parts=first_parts))
        
        if question:
            contents.append(types.Content(
                role="user", 
                parts=[types.Part.from_text(text=question)]
            ))
        
        return contents
    
    def _get_structured_config(self):
        try:
            return types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "required": ["video_description", "audio_description", "summary", "answer"],
                    "properties": {
                        "video_description": {"type": "string"},
                        "audio_description": {"type": "string"},
                        "summary": {"type": "string"},
                        "answer": {"type": "string"}
                    }
                },
                system_instruction=[
                    types.Part.from_text(text="""your a video understanding AI that reads and sees the complete video and extracts all details and gives the output 

gives an exact audio transcript in  audio_description with time stamps like 0:02:680
and detail actions with time stamps  like this 0:02:680  of actions in the video in  like he is moving his hand or the fan is moving video_description
and a complete summary in a summary tag 
The answer to the question in the answer should be like a helpful assistant tag """),
                ],
                temperature=0.1,
                max_output_tokens=2048,
                top_p=0.95,
                top_k=40
            )
        except Exception as e:
            logger.error(f"Schema config error: {e}")
            return types.GenerateContentConfig(
                system_instruction=[
                    types.Part.from_text(text="""your a video understanding AI that reads and sees the complete video and extracts all details and gives the output 

gives an exact audio transcript in  audio_description with time stamps like 0:02:680
and detail actions with time stamps  like this 0:02:680  of actions in the video in  like he is moving his hand or the fan is moving video_description
and a complete summary in a summary tag 
The answer to the question in the answer should be like a helpful assistant tag 

IMPORTANT: Always respond with valid JSON in this format:
{
  "answer": "your answer",
  "audio_description": "timestamped audio",
  "summary": "video summary", 
  "video_description": "timestamped video description"
}"""),
                ],
                temperature=0.1,
                max_output_tokens=2048,
                top_p=0.95,
                top_k=40
            )
    
    def _generate(self, contents):
        try:
            logger.info(f"Sending to Gemini - Total contents: {len(contents)}")
            
            config = self._get_structured_config()
            
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=contents,
                config=config
            )
            
            logger.info(f"Gemini response finish_reason: {getattr(response.candidates[0], 'finish_reason', 'Unknown') if response.candidates else 'No candidates'}")
            
            if hasattr(response, 'text') and response.text:
                return response.text.strip()
            
            if hasattr(response, 'candidates') and response.candidates:
                for candidate in response.candidates:
                    if hasattr(candidate, 'content') and candidate.content:
                        if hasattr(candidate.content, 'parts') and candidate.content.parts:
                            text_parts = []
                            for part in candidate.content.parts:
                                if hasattr(part, 'text') and part.text:
                                    text_parts.append(part.text.strip())
                            
                            if text_parts:
                                return " ".join(text_parts)
            
            error_response = {
                "answer": "No response received from Gemini",
                "audio_description": "Unable to extract audio description",
                "summary": "Unable to generate summary", 
                "video_description": "Unable to extract video description"
            }
            return json.dumps(error_response, indent=2)
            
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            error_response = {
                "answer": f"Error connecting to Gemini: {str(e)}",
                "audio_description": "Unable to process due to API error",
                "summary": "Unable to process due to API error",
                "video_description": "Unable to process due to API error"
            }
            return json.dumps(error_response, indent=2)
    
    def analyze_video(self, video_path: str, question: str) -> str:
        contents = self._create_content(video_path=video_path, question=question)
        return self._generate(contents)
    
    def analyze_audio(self, video_path: str, question: str) -> str:
        contents = self._create_content(video_path=video_path, question=question)
        return self._generate(contents)
    
    def analyze_image(self, screenshot_path: str, question: str) -> str:
        contents = self._create_content(screenshot_path=screenshot_path, question=question)
        return self._generate(contents)

# Result Storage
class ResultStorage:
    @staticmethod
    def save_result(data: Dict[str, Any]) -> str:
        os.makedirs(Config.RESULTS_DIR, exist_ok=True)
        filename = os.path.join(Config.RESULTS_DIR, f"{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
        with open(filename, 'w') as f:
            json.dump({**data, "saved_at": datetime.now().isoformat()}, f, indent=2)
        return filename


# server/main.py - Replace the AlertManager class

class AlertManager:
    def __init__(self):
        self.alerts: Dict[str, RealTimeAlert] = {}
        self.alert_threads: Dict[str, threading.Thread] = {}
        self.alert_stop_events: Dict[str, threading.Event] = {}
        self.alert_triggered: Dict[str, bool] = {}
        self.alert_completed: Dict[str, bool] = {}
        self.alert_detections: Dict[str, List[dict]] = {}
        self.VIDEO_DIR = "server"
        self.TEMP_CHUNKS_DIR = "server/temp_chunks"
        os.makedirs(self.TEMP_CHUNKS_DIR, exist_ok=True)
        
    def create_alert(self, video_id: str, alert_description: str, interval_seconds: int = 10) -> RealTimeAlert:
        alert_id = str(uuid.uuid4())
        alert = RealTimeAlert(
            id=alert_id,
            video_id=video_id,
            alert_description=alert_description,
            interval_seconds=interval_seconds,
            created_at=datetime.now()
        )
        self.alerts[alert_id] = alert
        self.alert_triggered[alert_id] = False
        self.alert_completed[alert_id] = False
        self.alert_detections[alert_id] = []
        self.start_monitoring(alert)
        return alert
    
    def start_monitoring(self, alert: RealTimeAlert):
        if alert.id in self.alert_threads:
            return
        
        stop_event = threading.Event()
        self.alert_stop_events[alert.id] = stop_event
        
        thread = threading.Thread(
            target=self._monitor_loop,
            args=(alert, stop_event),
            daemon=True
        )
        self.alert_threads[alert.id] = thread
        thread.start()
        logger.info(f"Started monitoring alert: {alert.id} for video {alert.video_id}")
    
    def _get_video_path(self, video_id: str) -> Optional[str]:
        video_path = os.path.join(self.VIDEO_DIR, f"{video_id}.mp4")
        if os.path.exists(video_path):
            return video_path
        return None
    
    def _monitor_loop(self, alert: RealTimeAlert, stop_event: threading.Event):
        """Monitor video by splitting into chunks and analyzing each"""
        video_path = self._get_video_path(alert.video_id)
        
        if not video_path:
            logger.error(f"Video not found for alert {alert.id}: {alert.video_id}.mp4")
            self.alert_completed[alert.id] = True
            return
        
        logger.info(f"⏰ Alert {alert.id} splitting video into {alert.interval_seconds}s chunks")
        
        try:
            # Get video duration
            cap = cv2.VideoCapture(video_path)
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration = total_frames / fps if fps > 0 else 0
            cap.release()
            
            # Calculate number of chunks
            num_chunks = int(duration // alert.interval_seconds)
            if duration % alert.interval_seconds > 0:
                num_chunks += 1  # Add one more chunk for the remaining seconds
            
            logger.info(f"📹 Video: {duration:.1f}s total, splitting into {num_chunks} chunks of {alert.interval_seconds}s")
            
            # Process each chunk
            for chunk_index in range(num_chunks):
                if stop_event.is_set():
                    logger.info(f"Alert {alert.id} stopped by user")
                    break
                
                start_time = chunk_index * alert.interval_seconds
                end_time = min(start_time + alert.interval_seconds, duration)
                chunk_duration = end_time - start_time
                
                logger.info(f"🎬 Processing chunk {chunk_index + 1}/{num_chunks}: {start_time:.1f}s - {end_time:.1f}s ({chunk_duration:.1f}s)")
                
                # Create video chunk
                chunk_path = self._create_video_chunk(
                    video_path, 
                    start_time, 
                    chunk_duration,
                    alert.id,
                    chunk_index
                )
                
                if not chunk_path or not os.path.exists(chunk_path):
                    logger.error(f"Failed to create chunk {chunk_index}")
                    continue
                
                # Extract thumbnail for the chunk
                screenshot_path = self._extract_chunk_thumbnail(chunk_path, alert.id, chunk_index)
                
                # Analyze this chunk
                result = self._analyze_video_chunk(
                    chunk_path,
                    alert.alert_description,
                    start_time,
                    end_time,
                    chunk_index + 1,
                    num_chunks
                )
                
                try:
                    cleaned_result = self._clean_json_response(result)
                    parsed = json.loads(cleaned_result)
                    
                    detected = parsed.get('detected', False)
                    confidence = parsed.get('confidence', 0.0)
                    
                    logger.info(f"⏱️  Chunk {chunk_index + 1}: detected={detected}, confidence={confidence:.2%}")
                    
                    # Store detection result
                    detection_data = {
                    "id": str(uuid.uuid4()),
                    "task_id": alert.id,
                    "detected": detected,
                    "confidence": confidence,
                    "timestamp": datetime.now().isoformat(),
                    "video_timestamp": f"{int(start_time // 60)}:{int(start_time % 60):02d} - {int(end_time // 60)}:{int(end_time % 60):02d}",
                    "chunk_index": chunk_index + 1,
                    "details": parsed.get('answer', ''),
                    "summary": parsed.get('summary', ''),
                    "snapshot": screenshot_path or "",
                    "video_path": chunk_path,
                    "chunk_duration": chunk_duration
                }

                    
                    self.alert_detections[alert.id].append(detection_data)
                    logger.info(f"📝 Stored detection for chunk {chunk_index + 1}")

                    
                    # Trigger alert if detected
                    if detected and confidence > 0.7:
                        self.alert_triggered[alert.id] = True
                        
                        asyncio.run(self._send_alert_notification(
                            alert, parsed, screenshot_path or "", chunk_path, start_time, end_time
                        ))
                        
                        logger.warning(f"🚨 ALERT in chunk {chunk_index + 1} ({start_time:.1f}s - {end_time:.1f}s): {alert.alert_description}")
                
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse response for chunk {chunk_index + 1}: {e}")
                
                # Clean up chunk file to save space (optional - comment out if you want to keep them)
                # try:
                #     os.remove(chunk_path)
                # except:
                #     pass
            
            self.alert_completed[alert.id] = True
            logger.info(f"✅ Alert {alert.id} completed - analyzed {num_chunks} chunks")
                
        except Exception as e:
            logger.error(f"Error in alert monitoring: {e}")
            import traceback
            traceback.print_exc()
            self.alert_completed[alert.id] = True
        
        finally:
            if alert.id in self.alert_stop_events:
                del self.alert_stop_events[alert.id]
            if alert.id in self.alert_threads:
                del self.alert_threads[alert.id]
    
    def _create_video_chunk(self, video_path: str, start_time: float, duration: float, 
                           alert_id: str, chunk_index: int) -> Optional[str]:
        """Create a video chunk using ffmpeg"""
        try:
            chunk_filename = f"alert_{alert_id}_chunk_{chunk_index}_{int(start_time)}s.mp4"
            chunk_path = os.path.join(self.TEMP_CHUNKS_DIR, chunk_filename)
            
            # Use ffmpeg to extract the chunk
            cmd = [
                'ffmpeg',
                '-ss', str(start_time),      # Start time (IMPORTANT: place -ss before -i for speed)
                '-i', video_path,
                '-t', str(duration),         # Duration
                '-c:v', 'libx264',           # <--- THE FIX: Re-encode video
                '-preset', 'veryfast',       # Good speed/quality balance
                '-c:a', 'aac',               # Re-encode audio
                '-y',                        # Overwrite output file
                chunk_path
            ]

            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                logger.error(f"FFmpeg error: {result.stderr}")
                return None
            
            # Verify chunk was created and has content
            if os.path.exists(chunk_path) and os.path.getsize(chunk_path) > 1000:
                logger.info(f"✂️  Created chunk: {chunk_filename} ({os.path.getsize(chunk_path)} bytes)")
                return chunk_path
            else:
                logger.error(f"Chunk file too small or doesn't exist")
                return None
                
        except Exception as e:
            logger.error(f"Failed to create video chunk: {e}")
            return None
    
    def _extract_chunk_thumbnail(self, chunk_path: str, alert_id: str, chunk_index: int) -> Optional[str]:
        """Extract a thumbnail from the middle of the chunk"""
        try:
            cap = cv2.VideoCapture(chunk_path)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            middle_frame = total_frames // 2
            
            cap.set(cv2.CAP_PROP_POS_FRAMES, middle_frame)
            ret, frame = cap.read()
            cap.release()
            
            if ret and frame is not None:
                os.makedirs(Config.FRAMES_DIR, exist_ok=True)
                screenshot_path = os.path.join(
                    Config.FRAMES_DIR,
                    f"alert_{alert_id}_chunk_{chunk_index}_thumb.jpg"
                )
                cv2.imwrite(screenshot_path, frame)
                return screenshot_path
            
            return None
        except Exception as e:
            logger.error(f"Failed to extract thumbnail: {e}")
            return None
    
    def _analyze_video_chunk(self, chunk_path: str, alert_description: str,
                            start_time: float, end_time: float,
                            chunk_num: int, total_chunks: int) -> str:
        """Send video chunk to Gemini for analysis"""
        try:
            # Check file size
            file_size = os.path.getsize(chunk_path)
            if file_size > 50 * 1024 * 1024:  # 50MB limit
                logger.warning(f"Chunk too large ({file_size} bytes), skipping")
                return json.dumps({
                    "detected": False,
                    "confidence": 0.0,
                    "summary": "Chunk too large to process",
                    "answer": "File size exceeds limit"
                })
            
            # Read video chunk
            with open(chunk_path, 'rb') as f:
                video_data = f.read()
            
            logger.info(f"📤 Sending {file_size / (1024*1024):.2f}MB chunk to Gemini")
            
            prompt = f"""
            Analyze this video segment carefully.
            
            Video Context:
            - This is chunk {chunk_num} of {total_chunks}
            - Time range: {int(start_time // 60)}:{int(start_time % 60):02d} to {int(end_time // 60)}:{int(end_time % 60):02d}
            - Duration: {end_time - start_time:.1f} seconds
            
            Task: Determine if this condition occurs in this video segment: "{alert_description}"
            
            Watch the ENTIRE segment carefully from start to end.
            
            IMPORTANT: Respond with valid JSON only:
            {{
                "detected": true or false,
                "confidence": 0.0 to 1.0,
                "summary": "brief description of what happens in this segment",
                "answer": "detailed explanation - if detected, mention at what point in the segment it occurs"
            }}
            
            Set "detected" to true ONLY if you clearly see the condition in this segment.
            """
            
            contents = [
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_bytes(mime_type="video/mp4", data=video_data),
                        types.Part.from_text(text=prompt)
                    ]
                )
            ]
            
            response = gemini_analyzer.client.models.generate_content(
                model="gemini-2.0-flash-exp",
                contents=contents,
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    max_output_tokens=2048
                )
            )
            
            result = response.text if response.text else '{"detected": false, "confidence": 0.0, "answer": "No response", "summary": "No response"}'
            logger.info(f"✅ Received response from Gemini for chunk {chunk_num}")
            
            return result
            
        except Exception as e:
            logger.error(f"Gemini analysis error for chunk: {e}")
            import traceback
            traceback.print_exc()
            return json.dumps({
                "detected": False,
                "confidence": 0.0,
                "summary": f"Analysis failed: {str(e)}",
                "answer": f"Error: {str(e)}"
            })
    
    def _clean_json_response(self, response: str) -> str:
        try:
            if '```json' in response:
                start = response.find('```json') + 7
                end = response.find('```', start)
                if end != -1:
                    response = response[start:end]
            elif '```' in response:
                start = response.find('```') + 3  
                end = response.find('```', start)
                if end != -1:
                    response = response[start:end]
            
            response = response.strip()
            json.loads(response)
            return response
            
        except json.JSONDecodeError:
            import re
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response, re.DOTALL)
            if json_match:
                potential_json = json_match.group(0)
                try:
                    json.loads(potential_json)
                    return potential_json
                except:
                    pass
            
            return json.dumps({
                "answer": "Failed to parse response",
                "detected": False,
                "confidence": 0.0,
                "summary": "JSON parsing error"
            })
    
    async def _send_alert_notification(self, alert: RealTimeAlert, detection: dict,
                                      snapshot_path: str, chunk_path: str, 
                                      start_time: float, end_time: float):
        """Send WebSocket notification"""
        message = {
            "type": "alert_triggered",
            "data": {
                "alert_id": alert.id,
                "video_id": alert.video_id,
                "video_name": f"{alert.video_id}.mp4",
                "description": alert.alert_description,
                "detected": detection.get('detected'),
                "confidence": detection.get('confidence'),
                "details": detection.get('answer', ''),
                "summary": detection.get('summary', ''),
                "snapshot": snapshot_path,
                "video_path": chunk_path,
                "video_timestamp": f"{int(start_time // 60)}:{int(start_time % 60):02d} - {int(end_time // 60)}:{int(end_time % 60):02d}",
                "timestamp": datetime.now().isoformat()
            }
        }
        await manager.broadcast(message)
    
    def rerun_alert(self, alert_id: str):
        """Rerun a completed alert"""
        alert = self.alerts.get(alert_id)
        if not alert:
            raise HTTPException(404, "Alert not found")
        
        # Reset state
        self.alert_triggered[alert_id] = False
        self.alert_completed[alert_id] = False
        self.alert_detections[alert_id] = []
        
        # Restart monitoring
        self.start_monitoring(alert)
        logger.info(f"Rerunning alert: {alert_id}")
    
    def stop_alert(self, alert_id: str):
        """Stop and delete an alert"""
        if alert_id in self.alert_stop_events:
            self.alert_stop_events[alert_id].set()
            time.sleep(0.5)
        
        # Cleanup temp chunks for this alert
        try:
            import glob
            chunk_pattern = os.path.join(self.TEMP_CHUNKS_DIR, f"alert_{alert_id}_*.mp4")
            for chunk_file in glob.glob(chunk_pattern):
                try:
                    os.remove(chunk_file)
                    logger.info(f"Cleaned up chunk: {chunk_file}")
                except:
                    pass
        except Exception as e:
            logger.error(f"Error cleaning up chunks: {e}")
        
        if alert_id in self.alert_threads:
            del self.alert_threads[alert_id]
        if alert_id in self.alert_stop_events:
            del self.alert_stop_events[alert_id]
        if alert_id in self.alerts:
            del self.alerts[alert_id]
        if alert_id in self.alert_triggered:
            del self.alert_triggered[alert_id]
        if alert_id in self.alert_completed:
            del self.alert_completed[alert_id]
        if alert_id in self.alert_detections:
            del self.alert_detections[alert_id]
        
        logger.info(f"Deleted alert: {alert_id}")
    
    def get_alerts(self) -> List[RealTimeAlert]:
        """Get all alerts"""
        return list(self.alerts.values())
    
    def get_alert(self, alert_id: str) -> Optional[RealTimeAlert]:
        """Get specific alert by ID"""
        return self.alerts.get(alert_id)
    
    def get_detections(self, alert_id: str) -> List[dict]:
        """Get all detections for a specific alert"""
        return self.alert_detections.get(alert_id, [])

# Keep alert_manager initialization
alert_manager = AlertManager()



# Initialize
stream_handler = None  # Will be initialized in lifespan
chunk_manager = ChunkManager()
video_processor = VideoProcessor()
gemini_analyzer = GeminiAnalyzer()
result_storage = ResultStorage()

@asynccontextmanager
async def lifespan(app: FastAPI):
    global stream_handler
    for dir_name in [Config.CHUNKS_DIR, Config.FRAMES_DIR, Config.RESULTS_DIR]:
        os.makedirs(dir_name, exist_ok=True)
    
    # Initialize but DON'T auto-start
    stream_handler = RTSPStreamHandler(manager)
    # stream_handler.start_streaming()  # REMOVED - only starts when user adds RTSP
    
    logger.info("Server ready. RTSP streaming will start when user adds a stream.")
    
    yield
    
    if stream_handler:
        stream_handler.stop_streaming()

app = FastAPI(title="RTSP Video Analysis API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # This allows all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket endpoint
@app.websocket("/ws/chunks")
async def websocket_chunks(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)



@app.post("/api/rtsp/start")
async def start_rtsp_stream():
    """Start RTSP streaming"""
    global stream_handler
    if stream_handler and not stream_handler.is_running:
        stream_handler.start_streaming()
        return {"success": True, "message": "RTSP streaming started"}
    elif stream_handler and stream_handler.is_running:
        return {"success": True, "message": "RTSP streaming already running"}
    else:
        raise HTTPException(500, "Stream handler not initialized")

@app.post("/api/rtsp/stop")
async def stop_rtsp_stream():
    """Stop RTSP streaming"""
    global stream_handler
    if stream_handler and stream_handler.is_running:
        stream_handler.stop_streaming()
        return {"success": True, "message": "RTSP streaming stopped"}
    else:
        return {"success": True, "message": "RTSP streaming not running"}

@app.post("/set-rtsp")
async def set_rtsp_url(request: dict):
    """Set RTSP URL and start streaming"""
    try:
        new_url = request.get("url")
        if new_url:
            Config.RTSP_URL = new_url
            
            # Stop existing stream if running
            if stream_handler and stream_handler.is_running:
                stream_handler.stop_streaming()
                time.sleep(2)
            
            # Start with new URL
            stream_handler.start_streaming()
            
            return {
                "status": "success", 
                "message": f"RTSP URL updated to {new_url} and streaming started"
            }
        else:
            raise HTTPException(400, "URL is required")
    except Exception as e:
        raise HTTPException(500, f"Failed to update RTSP URL: {str(e)}")




# Helper function
def get_chunk_and_screenshot(time_param: str):
    video_path = chunk_manager.get_latest_chunk() if time_param == "last" else chunk_manager.get_chunk_by_time(time_param)
    if not video_path or not os.path.exists(video_path):
        raise HTTPException(404, "No video chunk found")
    screenshot_path = video_processor.extract_screenshot(video_path)
    if not os.path.exists(screenshot_path):
        raise HTTPException(500, "Screenshot extraction failed")
    return video_path, screenshot_path

# API Endpoints
@app.get("/")
async def root():
    return {"message": "RTSP Video Analysis API", "status": "running", "streaming": stream_handler.is_running if stream_handler else False}

@app.get("/status")
async def get_status():
    chunks_count = len(list(Path(Config.CHUNKS_DIR).glob("*.mp4"))) if Path(Config.CHUNKS_DIR).exists() else 0
    return {
        "streaming": stream_handler.is_running if stream_handler else False,
        "chunks": chunks_count,
        "latest_chunk": chunk_manager.get_latest_chunk(),
        "websocket_clients": len(manager.active_connections)
    }

@app.post("/ask/video")
async def ask_video(request: AskRequest, background_tasks: BackgroundTasks):
    video_path, screenshot_path = get_chunk_and_screenshot(request.time)
    answer = gemini_analyzer.analyze_video(video_path, request.question)
    
    response = AskResponse(
        answer=answer, video=video_path, screenshot=screenshot_path,
        timestamp=datetime.now().isoformat(), question=request.question
    )
    background_tasks.add_task(result_storage.save_result, response.dict())
    return response

@app.post("/ask/audio") 
async def ask_audio(request: AskRequest, background_tasks: BackgroundTasks):
    video_path, screenshot_path = get_chunk_and_screenshot(request.time)
    answer = gemini_analyzer.analyze_audio(video_path, request.question)
    
    response = AskResponse(
        answer=answer, video=video_path, screenshot=screenshot_path,
        timestamp=datetime.now().isoformat(), question=request.question
    )
    background_tasks.add_task(result_storage.save_result, response.dict())
    return response

@app.post("/ask/image")
async def ask_image(request: AskRequest, background_tasks: BackgroundTasks):
    video_path, screenshot_path = get_chunk_and_screenshot(request.time)
    answer = gemini_analyzer.analyze_image(screenshot_path, request.question)
    
    response = AskResponse(
        answer=answer, video=video_path, screenshot=screenshot_path,
        timestamp=datetime.now().isoformat(), question=request.question
    )
    background_tasks.add_task(result_storage.save_result, response.dict())
    return response

@app.post("/ask")
async def ask_smart(request: AskRequest, background_tasks: BackgroundTasks):
    video_path, screenshot_path = get_chunk_and_screenshot(request.time)
    
    audio_keywords = ['say', 'said', 'speak', 'talk', 'audio', 'sound', 'voice', 'hear']
    video_keywords = ['move', 'movement', 'action', 'activity', 'happen', 'doing']
    
    question_lower = request.question.lower()
    
    if any(word in question_lower for word in audio_keywords):
        answer = gemini_analyzer.analyze_audio(video_path, request.question)
    elif any(word in question_lower for word in video_keywords):
        answer = gemini_analyzer.analyze_video(video_path, request.question)
    else:
        answer = gemini_analyzer.analyze_image(screenshot_path, request.question)
    
    response = AskResponse(
        answer=answer, video=video_path, screenshot=screenshot_path,
        timestamp=datetime.now().isoformat(), question=request.question
    )
    background_tasks.add_task(result_storage.save_result, response.dict())
    return response

@app.get("/chunks")
async def list_chunks():
    chunks_dir = Path(Config.CHUNKS_DIR)
    if not chunks_dir.exists():
        return {"chunks": []}
    
    chunks = []
    for chunk in sorted(chunks_dir.glob("*.mp4"), key=lambda x: x.stat().st_mtime, reverse=True):
        stat = chunk.stat()
        chunks.append({
            "filename": chunk.name,
            "size": stat.st_size,
            "created": datetime.fromtimestamp(stat.st_ctime).isoformat()
        })
    return {"chunks": chunks}

@app.get("/results")
async def list_results():
    results_dir = Path(Config.RESULTS_DIR)
    if not results_dir.exists():
        return {"results": []}
    
    results = []
    for result in sorted(results_dir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            with open(result, 'r') as f:
                data = json.load(f)
            results.append({
                "filename": result.name,
                "question": data.get("question", ""),
                "timestamp": data.get("timestamp", "")
            })
        except:
            continue
    return {"results": results}

@app.get("/test-gemini")
async def test_gemini():
    try:
        contents = [types.Content(role="user", parts=[types.Part.from_text(text="Say 'Hello, API is working!'")])]
        response = gemini_analyzer.client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=100)
        )
        
        return {
            "status": "success",
            "response": response.text if hasattr(response, 'text') and response.text else str(response),
            "api_key_configured": Config.GEMINI_API_KEY != "your-gemini-api-key-here"
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "api_key_configured": Config.GEMINI_API_KEY != "your-gemini-api-key-here"
        }

@app.get("/stream")
async def get_stream():
    def generate():
        try:
            cmd = ['ffmpeg', '-i', Config.RTSP_URL, '-c:v', 'libx264', '-preset', 'ultrafast', '-f', 'mpegts', '-']
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE)
            while True:
                data = process.stdout.read(1024)
                if not data:
                    break
                yield data
        except:
            yield b""
    return StreamingResponse(generate(), media_type="video/mp2t")




@app.get("/api/videos")
async def list_videos():
    """List available sample videos"""
    video_dir = "server"
    videos = []
    
    # Scan for MP4 files in the server directory
    if os.path.exists(video_dir):
        for file in os.listdir(video_dir):
            if file.endswith('.mp4') and file[0].isdigit():
                video_id = file.replace('.mp4', '')
                videos.append({
                    "id": video_id,
                    "name": file,
                    "path": os.path.join(video_dir, file)
                })
    
    # Sort by filename
    videos.sort(key=lambda x: x['name'])
    
    logger.info(f"Found {len(videos)} sample videos")
    return {"videos": videos}

@app.post("/api/alerts")
async def create_alert(video_id: str, alert_description: str, interval_seconds: int = 10):
    """Create a new real-time alert with custom interval"""
    try:
        logger.info(f"Creating alert for video {video_id}: {alert_description} (interval: {interval_seconds}s)")
        
        # Verify video exists
        video_path = os.path.join("server", f"{video_id}.mp4")
        if not os.path.exists(video_path):
            raise HTTPException(status_code=404, detail=f"Video {video_id}.mp4 not found")
        
        alert = alert_manager.create_alert(video_id, alert_description, interval_seconds)
        
        logger.info(f"Alert created successfully: {alert.id}")
        
        return {
            "success": True,
            "alert": {
                "id": alert.id,
                "video_id": alert.video_id,
                "description": alert.alert_description,
                "interval_seconds": alert.interval_seconds,
                "is_active": alert.is_active,
                "created_at": alert.created_at.isoformat()
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create alert: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Update get_alert endpoint to include interval
@app.get("/api/alerts/{alert_id}")
async def get_alert(alert_id: str):
    """Get specific alert details"""
    alert = alert_manager.get_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    return {
        "id": alert.id,
        "video_id": alert.video_id,
        "description": alert.alert_description,
        "interval_seconds": alert.interval_seconds,
        "is_active": alert.is_active,
        "last_check": alert.last_check.isoformat() if alert.last_check else None,
        "created_at": alert.created_at.isoformat() if alert.created_at else None
    }

# Update list_alerts to include interval
@app.get("/api/alerts")
async def list_alerts():
    """List all active alerts"""
    try:
        alerts = alert_manager.get_alerts()
        return {
            "alerts": [
                {
                    "id": alert.id,
                    "video_id": alert.video_id,
                    "description": alert.alert_description,
                    "interval_seconds": alert.interval_seconds,
                    "is_active": alert.is_active,
                    "last_check": alert.last_check.isoformat() if alert.last_check else None,
                    "created_at": alert.created_at.isoformat() if alert.created_at else None
                }
                for alert in alerts
            ]
        }
    except Exception as e:
        logger.error(f"Failed to list alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/alerts/{alert_id}")
async def delete_alert(alert_id: str):
    """Delete/stop an alert"""
    try:
        alert_manager.stop_alert(alert_id)
        if alert_id in alert_manager.alerts:
            del alert_manager.alerts[alert_id]
        return {"success": True, "message": "Alert deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tasks")
async def list_tasks(video_id: str):
    """List all tasks for a specific video with their detection results"""
    video_alerts = [a for a in alert_manager.get_alerts() if a.video_id == video_id]
    
    tasks = []
    for alert in video_alerts:
        # Determine status
        is_completed = alert_manager.alert_completed.get(alert.id, False)
        is_running = alert.id in alert_manager.alert_threads
        
        if is_completed:
            status = "completed"
        elif is_running:
            status = "running"
        else:
            status = "pending"
        
        # Get detections for this alert
        detections = alert_manager.get_detections(alert.id)
        
        logger.info(f"Task {alert.id}: status={status}, detections={len(detections)}")  # ✅ DEBUG
        
        tasks.append({
            "id": alert.id,
            "description": alert.alert_description,
            "status": status,
            "alerts": detections,  # This should now be populated!
            "created_at": alert.created_at.isoformat() if alert.created_at else None,
            "is_completed": is_completed,  # ✅ Extra info for debugging
            "detection_count": len(detections)  # ✅ Extra info for debugging
        })
    
    logger.info(f"Returning {len(tasks)} tasks for video {video_id}")
    return {"tasks": tasks}
@app.get("/api/debug/detections/{alert_id}")
async def debug_detections(alert_id: str):
    """Debug endpoint to see stored detections"""
    return {
        "alert_id": alert_id,
        "exists": alert_id in alert_manager.alert_detections,
        "detections": alert_manager.alert_detections.get(alert_id, []),
        "completed": alert_manager.alert_completed.get(alert_id, False),
        "triggered": alert_manager.alert_triggered.get(alert_id, False)
    }


# Add these endpoints AFTER the existing alert endpoints

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str):
    """Delete a task (alert)"""
    try:
        alert_manager.stop_alert(task_id)
        return {"success": True, "message": "Task deleted successfully"}
    except Exception as e:
        logger.error(f"Failed to delete task {task_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tasks/{task_id}/rerun")
async def rerun_task(task_id: str):
    """Rerun a completed task"""
    try:
        alert_manager.rerun_alert(task_id)
        return {"success": True, "message": "Task rerunning"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to rerun task {task_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tasks/{task_id}/details")
async def get_task_details(task_id: str):
    """Get detailed information about a task and its detections"""
    try:
        alert = alert_manager.get_alert(task_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Task not found")
        
        detections = alert_manager.get_detections(task_id)
        
        is_completed = alert_manager.alert_completed.get(task_id, False)
        is_running = task_id in alert_manager.alert_threads
        
        return {
            "id": alert.id,
            "description": alert.alert_description,
            "video_id": alert.video_id,
            "status": "completed" if is_completed else ("running" if is_running else "pending"),
            "created_at": alert.created_at.isoformat() if alert.created_at else None,
            "detections": detections,
            "is_triggered": alert_manager.alert_triggered.get(task_id, False)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get task details {task_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        ssl_keyfile="../192.168.1.20+2-key.pem",
        ssl_certfile="../192.168.1.20+2.pem"
    )