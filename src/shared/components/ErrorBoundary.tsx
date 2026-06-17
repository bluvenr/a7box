/**
 * A7Box ErrorBoundary
 * Catches rendering errors in child components and shows a friendly fallback card
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  /** Optional module ID for context */
  moduleId?: string
  /** Custom fallback UI */
  fallback?: ReactNode
  /** Children to render */
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[A7Box] Component error${this.props.moduleId ? ` in module "${this.props.moduleId}"` : ''}:`,
      error,
      errorInfo.componentStack
    )
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex h-full items-center justify-center bg-bg-base p-8">
          <div className="max-w-md rounded-xl border border-error/20 bg-bg-elevated p-8 text-center">
            {/* Error icon */}
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error/10">
              <svg
                className="h-8 w-8 text-error"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
            </div>

            <h2 className="mb-2 text-lg font-semibold text-text-primary">
              Oops, something went wrong
            </h2>

            <p className="mb-1 text-sm text-text-secondary">
              {this.props.moduleId
                ? `Module "${this.props.moduleId}" encountered an error`
                : 'An unexpected error occurred'}
            </p>

            {this.state.error && (
              <p className="mb-4 font-mono text-xs text-error/70">
                {this.state.error.message}
              </p>
            )}

            <button
              onClick={this.handleRetry}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
