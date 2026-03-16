import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'
import type { NextConfig } from 'next'
import fs from 'node:fs'
import path from 'node:path'

export default async (phase: string) => {
    const isDev = phase === PHASE_DEVELOPMENT_SERVER
    let firebaseConfig: string;

    if (process.env.FIREBASE_CONFIG) {
        firebaseConfig = process.env.FIREBASE_CONFIG
    } else {
        const configPath = path.join(process.cwd(), 'app', 'modules', 'firebase', 'config.json')
        firebaseConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '{}'
    }

    const nextConfig: NextConfig = {
        assetPrefix: isDev ? undefined : './',
        reactStrictMode: false,
        output: 'export',
        webpack: (
            config
        ) => {
            config.module.rules.push({
                test: /\.(vert|frag)$/,
                loader: 'raw-loader'
            })
            config.resolve.fallback = { fs: false };
            return config
        },
        env: {
            COMMIT: process.env.COMMIT,
            FIREBASE_CONFIG: firebaseConfig
        },
        async rewrites() {
            return [
                {
                    source: '/:path.html',
                    destination: '/:path'
                },
            ]
        },
    };
    return nextConfig
}

