/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@postdeck/core', '@postdeck/adapters'],
  serverExternalPackages: ['jiti'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    }
    return config
  },
}
export default nextConfig
