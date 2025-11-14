/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Define the paths we want to ignore
      const ignoredPaths = [
        '**/server/**',
        '**/frames/**',
        '**/chunks/**',
        '**/results/**',
        '**/*.py',
        '**/__pycache__/**',
      ];
      
      // Get existing ignored patterns and filter out any empty/invalid ones
      const existingIgnored = config.watchOptions?.ignored || [];
      const validExistingIgnored = Array.isArray(existingIgnored) 
        ? existingIgnored.filter(pattern => typeof pattern === 'string' && pattern.trim().length > 0)
        : (typeof existingIgnored === 'string' && existingIgnored.trim().length > 0) 
          ? [existingIgnored] 
          : [];

      // Combine valid existing patterns with new ones
      const combinedIgnored = [...validExistingIgnored, ...ignoredPaths];

      // Ensure we have at least one valid pattern
      const finalIgnored = combinedIgnored.length > 0 ? combinedIgnored : ['**/node_modules/**'];

      return {
        ...config,
        watchOptions: {
          ...config.watchOptions,
          ignored: finalIgnored,
        },
      };
    }

    return config;
  },
};

export default nextConfig;