import { BlogPost, BlogPostCreate, BlogPostUpdate } from '@/types'
import { ENV } from '@/lib/env'

/**
 * Direct API Blog Service - bypasses Supabase JS client for better reliability
 * Uses direct fetch calls to avoid client timeout issues
 */
export class DirectBlogService {
  private static readonly SUPABASE_URL = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
  private static readonly SUPABASE_KEY = ENV.SUPABASE_ANON_KEY || ''
  private static readonly TIMEOUT = 10000 // 10 seconds

  private static async fetchWithTimeout(url: string, options: RequestInit = {}) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'apikey': this.SUPABASE_KEY,
          'Authorization': `Bearer ${this.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
          ...options.headers
        }
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error:', response.status, errorText)
        throw new Error(`API Error ${response.status}: ${errorText}`)
      }
      
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout - please try again')
      }
      throw error
    }
  }

  // Test connection
  static async testConnection(): Promise<boolean> {
    try {
      console.log('🔍 Testing direct API connection...')
      const response = await this.fetchWithTimeout(`${this.SUPABASE_URL}/rest/v1/blog_posts?select=id&limit=1`)
      const data = await response.json()
      console.log('✅ Direct API connection successful:', data.length, 'test records')
      return true
    } catch (error) {
      console.error('❌ Direct API connection failed:', error)
      return false
    }
  }

  // Get published posts
  static async getPosts(season?: number, week?: number | null, limit = 10): Promise<BlogPost[]> {
    console.log('DirectBlogService.getPosts called with season:', season, 'week:', week)
    
    try {
      let url = `${this.SUPABASE_URL}/rest/v1/blog_posts?is_published=eq.true&order=created_at.desc`
      
      // Only apply season filter if specifically provided
      if (season !== undefined && season !== null) {
        url += `&season=eq.${season}`
        
        // Only apply week filter if season is filtered and week is specified
        if (week !== undefined) {
          if (week === null) {
            url += `&week=is.null`
          } else {
            url += `&week=eq.${week}`
          }
        }
      }
      
      if (limit) {
        url += `&limit=${limit}`
      }

      console.log('🔍 Fetching posts from:', url)
      const response = await this.fetchWithTimeout(url)
      const data = await response.json()
      
      console.log('✅ Got', data?.length || 0, 'posts')
      return data || []
    } catch (error) {
      console.error('DirectBlogService.getPosts failed:', error)
      throw error
    }
  }

  // Create a new blog post
  static async createPost(post: BlogPostCreate, authorId: string): Promise<BlogPost> {
    console.log('DirectBlogService.createPost called with:', post)
    
    try {
      // Generate slug from title
      const slug = post.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with dashes
        .replace(/-+/g, '-') // Replace multiple dashes with single dash
        .trim()

      const postData = {
        title: post.title,
        content: post.content,
        excerpt: post.excerpt || post.content.substring(0, 200) + '...',
        author_id: authorId,
        season: post.season,
        week: post.week,
        is_published: post.is_published || false,
        featured_image_url: post.featured_image_url || null,
        slug: slug,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      console.log('🔍 Creating post with data:', postData)

      const response = await this.fetchWithTimeout(`${this.SUPABASE_URL}/rest/v1/blog_posts`, {
        method: 'POST',
        body: JSON.stringify(postData)
      })

      const createdPost = await response.json()
      console.log('✅ Post created successfully:', createdPost[0]?.id)
      
      return createdPost[0]
    } catch (error) {
      console.error('DirectBlogService.createPost failed:', error)
      throw error
    }
  }

  // Update a blog post
  static async updatePost(id: string, updates: BlogPostUpdate): Promise<BlogPost> {
    console.log('DirectBlogService.updatePost called for ID:', id)
    
    try {
      const updateData = {
        ...updates,
        updated_at: new Date().toISOString()
      }

      // Generate new slug if title is being updated
      if (updates.title) {
        updateData.slug = updates.title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim()
      }

      console.log('🔍 Updating post with data:', updateData)

      const response = await this.fetchWithTimeout(`${this.SUPABASE_URL}/rest/v1/blog_posts?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData)
      })

      const updatedPost = await response.json()
      console.log('✅ Post updated successfully')
      
      return updatedPost[0]
    } catch (error) {
      console.error('DirectBlogService.updatePost failed:', error)
      throw error
    }
  }

  // Delete a blog post
  static async deletePost(id: string): Promise<void> {
    console.log('DirectBlogService.deletePost called for ID:', id)
    
    try {
      await this.fetchWithTimeout(`${this.SUPABASE_URL}/rest/v1/blog_posts?id=eq.${id}`, {
        method: 'DELETE'
      })

      console.log('✅ Post deleted successfully')
    } catch (error) {
      console.error('DirectBlogService.deletePost failed:', error)
      throw error
    }
  }

  // Get single post by slug
  static async getPostBySlug(slug: string): Promise<BlogPost | null> {
    console.log('DirectBlogService.getPostBySlug called with slug:', slug)
    
    try {
      const encodedSlug = encodeURIComponent(slug)
      console.log('DirectBlogService.getPostBySlug encoded slug:', encodedSlug)
      
      const response = await this.fetchWithTimeout(
        `${this.SUPABASE_URL}/rest/v1/blog_posts?slug=eq.${encodedSlug}&limit=1`
      )
      
      const data = await response.json()
      
      if (data && data.length > 0) {
        console.log('✅ Found post with slug:', slug)
        return data[0]
      } else {
        console.log('❌ No post found with slug:', slug)
        return null
      }
    } catch (error) {
      console.error('DirectBlogService.getPostBySlug failed:', error)
      throw error
    }
  }

  // Get all posts (admin)
  static async getAllPosts(limit = 20): Promise<BlogPost[]> {
    console.log('DirectBlogService.getAllPosts called')
    
    try {
      let url = `${this.SUPABASE_URL}/rest/v1/blog_posts?order=created_at.desc`
      
      if (limit) {
        url += `&limit=${limit}`
      }

      const response = await this.fetchWithTimeout(url)
      const data = await response.json()
      
      console.log('✅ Got', data?.length || 0, 'posts (including unpublished)')
      return data || []
    } catch (error) {
      console.error('DirectBlogService.getAllPosts failed:', error)
      throw error
    }
  }
}