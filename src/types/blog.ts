export interface BlogAttachment {
  name: string
  url: string
  type: string
  size: number
}

export interface BlogPost {
  id: string
  title: string
  content: string
  excerpt?: string
  author_id: string
  season: number
  week?: number | null // null for pre-season posts
  is_published: boolean
  featured_image_url?: string
  slug: string
  attachments?: BlogAttachment[]
  email_rundown?: string | null
  emailed_at?: string | null
  created_at: string
  updated_at: string
  author?: {
    id: string
    display_name: string
    email: string
  }
}

export interface BlogPostCreate {
  title: string
  content: string
  excerpt?: string
  email_rundown?: string | null
  season: number
  week?: number | null
  is_published?: boolean
  featured_image_url?: string
  attachments?: BlogAttachment[]
}

export interface BlogPostUpdate {
  title?: string
  content?: string
  excerpt?: string
  email_rundown?: string | null
  season?: number
  week?: number | null
  is_published?: boolean
  featured_image_url?: string
  attachments?: BlogAttachment[]
}

export interface WeekOption {
  value: number | null
  label: string
  season: number
}

export interface SeasonWeekFilter {
  season: number
  week?: number | null
}