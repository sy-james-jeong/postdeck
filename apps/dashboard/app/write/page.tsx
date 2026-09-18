import { listWritableProjects } from '../../lib/write.js'
import { WriteForm } from '../../components/WriteForm.js'

export const dynamic = 'force-dynamic'

export default async function WritePage() {
  const projects = await listWritableProjects()
  return (
    <main>
      <header className="topbar">
        <div>
          <h1>새 글 쓰기</h1>
          <p className="subtitle">주제를 입력하면 Gemini가 이 블로그 톤으로 초안을 생성하고 AI 티를 걷어냅니다 (De-AI).</p>
        </div>
        <a className="btn-ghost" href="/">← 대시보드</a>
      </header>
      <p className="note">
        생성은 유료 Gemini API를 호출하며 10~20초 걸릴 수 있어요. 결과는 <b>초안(draft)</b>으로만 저장되고 자동 발행되지 않습니다.
      </p>
      <WriteForm projects={projects} />
    </main>
  )
}
