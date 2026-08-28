export interface ToneContext {
  projectName: string
  samples: { title: string; snippet: string }[]
}

export interface GenerateInput {
  project: string
  topic: string
  toneContext: ToneContext
  lang?: string
}

export interface Draft {
  title: string
  excerpt: string
  tags: string[]
  body: string
}
