import { NextResponse, NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs';

// This path is correct for your workflow
const MEDIA_ROOT = path.join(process.cwd(), 'server');

// This function signature is the required fix for Next.js 15
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  try {
    const slug = params.slug;
    if (!slug || !Array.isArray(slug)) {
      return new NextResponse('Invalid media path', { status: 400 });
    }
    const filePathParam = slug.join('/');
    
    if (filePathParam.includes('..')) {
      return new NextResponse('Invalid path', { status: 400 });
    }

    const fullPath = path.join(MEDIA_ROOT, filePathParam);

    if (!fs.existsSync(fullPath)) {
      console.error(`[Media API] FILE NOT FOUND at path: ${fullPath}`);
      return new NextResponse('File not found', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(fullPath);
    
    let contentType = 'application/octet-stream';
    if (fullPath.endsWith('.mp4')) contentType = 'video/mp4';
    if (fullPath.endsWith('.jpg') || fullPath.endsWith('.jpeg')) contentType = 'image/jpeg';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('[Media API] An unexpected error occurred:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}