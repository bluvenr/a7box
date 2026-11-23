import { describe, it, expect } from 'vitest'
import {
  parsePageRange, parsePageGroups, chunkPages,
  formatBytes, baseName, fileExt, isPdfName, isImageName, pathBaseName,
} from '../utils'

describe('parsePageRange', () => {
  it('parses a single page', () => {
    expect(parsePageRange('5', 10)).toEqual([5])
  })

  it('parses ranges and lists, sorted and deduplicated', () => {
    expect(parsePageRange('1-3,5,8-10', 10)).toEqual([1, 2, 3, 5, 8, 9, 10])
    expect(parsePageRange('3,1-2,2', 5)).toEqual([1, 2, 3])
  })

  it('tolerates whitespace around parts and dashes', () => {
    expect(parsePageRange(' 1 - 3 , 5 ', 10)).toEqual([1, 2, 3, 5])
  })

  it('returns [] for empty input or invalid max', () => {
    expect(parsePageRange('', 10)).toEqual([])
    expect(parsePageRange('   ', 10)).toEqual([])
    expect(parsePageRange('1', 0)).toEqual([])
  })

  it('returns [] for malformed expressions', () => {
    expect(parsePageRange('abc', 10)).toEqual([])
    expect(parsePageRange('1-', 10)).toEqual([])
    expect(parsePageRange('3-1', 10)).toEqual([]) // reversed range
    expect(parsePageRange('0', 10)).toEqual([]) // below 1
    expect(parsePageRange('1-11', 10)).toEqual([]) // exceeds max
    expect(parsePageRange('1,,2', 10)).toEqual([]) // empty part
  })
})

describe('parsePageGroups', () => {
  it('splits each comma part into its own group', () => {
    expect(parsePageGroups('1-3,4-6', 6)).toEqual([[1, 2, 3], [4, 5, 6]])
    expect(parsePageGroups('1,2-3', 5)).toEqual([[1], [2, 3]])
  })

  it('returns [] when any part is invalid', () => {
    expect(parsePageGroups('1-3,abc', 6)).toEqual([])
    expect(parsePageGroups('', 6)).toEqual([])
    expect(parsePageGroups('1-7', 6)).toEqual([])
  })
})

describe('chunkPages', () => {
  it('chunks into groups of n', () => {
    expect(chunkPages(6, 2)).toEqual([[1, 2], [3, 4], [5, 6]])
    expect(chunkPages(5, 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('every page yields single-page groups', () => {
    expect(chunkPages(3, 1)).toEqual([[1], [2], [3]])
  })

  it('returns [] for invalid n or max', () => {
    expect(chunkPages(5, 0)).toEqual([])
    expect(chunkPages(0, 2)).toEqual([])
  })
})

describe('formatBytes', () => {
  it('formats across units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1048576)).toBe('1 MB')
  })
})

describe('name helpers', () => {
  it('baseName strips the extension', () => {
    expect(baseName('report.pdf')).toBe('report')
    expect(baseName('archive.tar.gz')).toBe('archive.tar')
    expect(baseName('noext')).toBe('noext')
  })

  it('fileExt lowercases the last extension', () => {
    expect(fileExt('a.PDF')).toBe('pdf')
    expect(fileExt('a.PNG')).toBe('png')
    expect(fileExt('noext')).toBe('noext')
  })

  it('isPdfName / isImageName detect by extension', () => {
    expect(isPdfName('x.pdf')).toBe(true)
    expect(isPdfName('x.png')).toBe(false)
    expect(isImageName('x.webp')).toBe(true)
    expect(isImageName('x.jpeg')).toBe(true)
    expect(isImageName('x.pdf')).toBe(false)
  })

  it('pathBaseName handles Windows and POSIX separators', () => {
    expect(pathBaseName('C:\\Users\\me\\doc.pdf')).toBe('doc.pdf')
    expect(pathBaseName('/home/me/doc.pdf')).toBe('doc.pdf')
    expect(pathBaseName('doc.pdf')).toBe('doc.pdf')
  })
})