/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    eslint: {
        ignoreDuringBuilds: true,
    },
    // API proxying is handled by app/api/[...path]/route.ts
    // which properly forwards Set-Cookie headers (rewrites strip them)
};

export default nextConfig;
