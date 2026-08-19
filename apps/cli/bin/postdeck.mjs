#!/usr/bin/env node
import { createJiti } from 'jiti'
const jiti = createJiti(import.meta.url, { interopDefault: true })
const { main } = await jiti.import('../src/main.ts')
await main()
