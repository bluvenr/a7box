/**
 * Code Minify Status Bar
 */

import { useTranslation } from 'react-i18next'
import { formatBytes } from '../utils/minifier'

interface StatusBarProps {
  inputLines: number
  inputChars: number
  outputSize: number | null
  inputSize: number | null
  outputLines: number
  outputChars: number
  savings: string | null
  children?: React.ReactNode
}

export function StatusBar({
  inputLines,
  inputChars,
  outputSize,
  inputSize,
  outputLines,
  outputChars,
  savings,
  children,
}: StatusBarProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-4 border-t border-border-subtle bg-bg-elevated px-4 py-1.5 text-xs">
      {/* Input stats */}
      {inputChars > 0 && (
        <>
          <span className="text-text-muted">
            {t('modules.codeMinify.ui.statsLines', { defaultValue: 'Lines' })}{' '}
            <span className="text-text-secondary">{inputLines}</span>
          </span>
          <span className="text-text-muted">
            {t('modules.codeMinify.ui.statsChars', { defaultValue: 'Chars' })}{' '}
            <span className="text-text-secondary">{inputChars}</span>
          </span>
        </>
      )}

      {/* Size comparison */}
      {inputSize != null && outputSize != null && (
        <>
          <span className="text-text-muted">
            {formatBytes(inputSize)} → {formatBytes(outputSize)}
          </span>
          {savings && (
            <span className="rounded bg-success/10 px-1.5 py-0.5 text-success">
              -{savings}
            </span>
          )}
        </>
      )}

      {/* Output stats */}
      {outputChars > 0 && (
        <span className="text-text-muted">
          {t('modules.codeMinify.ui.outputLabel', { defaultValue: 'Output' })}:{' '}
          <span className="text-text-secondary">{outputLines} {t('modules.codeMinify.ui.statsLines', { defaultValue: 'Lines' })}</span>
          {' · '}
          <span className="text-text-secondary">{outputChars} {t('modules.codeMinify.ui.statsChars', { defaultValue: 'Chars' })}</span>
        </span>
      )}

      <div className="flex-1" />

      {children}
    </div>
  )
}
