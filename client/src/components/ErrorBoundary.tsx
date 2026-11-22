import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Icon } from './Icons'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] 渲染失败', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="crash-screen">
        <div className="crash-card">
          <span className="crash-icon">
            <Icon name="info" size={22} />
          </span>
          <h1>应用遇到了一点问题</h1>
          <p>你的数据保存在本机，不会因为这次错误丢失。可以重新加载，或返回应用继续操作。</p>
          <div className="crash-actions">
            <button className="btn primary" onClick={() => window.location.reload()}>
              重新加载
            </button>
            <button className="btn" onClick={() => this.setState({ error: null })}>
              返回应用
            </button>
          </div>
          {this.state.error.message && (
            <details className="crash-detail">
              <summary>错误详情</summary>
              <pre>{this.state.error.message}</pre>
            </details>
          )}
        </div>
      </div>
    )
  }
}
