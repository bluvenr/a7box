/**
 * A7Box Command Palette Search Engine
 * Fuzzy search based on Fuse.js with weighted ranking
 */

import Fuse from 'fuse.js'
import type { CommandSearchItem } from '../types'

interface SearchOptions {
  threshold?: number
  limit?: number
}

export class CommandSearchEngine {
  private fuse: Fuse<CommandSearchItem>
  private items: CommandSearchItem[] = []

  constructor(options: SearchOptions = {}) {
    this.fuse = new Fuse<CommandSearchItem>([], {
      keys: [
        { name: 'label', weight: 0.4 },
        { name: 'description', weight: 0.2 },
        { name: 'tags', weight: 0.2 },
        { name: 'shortcut', weight: 0.1 },
        { name: 'moduleName', weight: 0.1 },
      ],
      threshold: options.threshold ?? 0.4,
      includeScore: true,
    })
  }

  /** Set search data source */
  setItems(items: CommandSearchItem[]) {
    this.items = items
    this.fuse.setCollection(items)
  }

  /** Execute search */
  search(query: string, limit = 20): CommandSearchItem[] {
    if (!query.trim()) {
      // Empty query: sort by recent usage
      return [...this.items]
        .sort((a, b) => {
          const aTime = a.lastUsedAt ?? 0
          const bTime = b.lastUsedAt ?? 0
          return bTime - aTime
        })
        .slice(0, limit)
    }

    const results = this.fuse.search(query, { limit })

    return results
      .map((result) => {
        const item = result.item
        const recencyBoost = this.getRecencyBoost(item.lastUsedAt)
        const adjustedScore = (result.score ?? 1) - recencyBoost
        return { ...item, score: adjustedScore }
      })
      .sort((a, b) => ((a as any).score ?? 1) - ((b as any).score ?? 1))
  }

  /** Calculate recency weight boost */
  private getRecencyBoost(lastUsedAt?: number): number {
    if (!lastUsedAt) return 0
    const now = Date.now()
    const hoursAgo = (now - lastUsedAt) / (1000 * 60 * 60)
    if (hoursAgo < 24) return 0.3      // Within 24 hours
    if (hoursAgo < 168) return 0.15     // Within 7 days
    return 0
  }
}

// Singleton instance
export const searchEngine = new CommandSearchEngine()
