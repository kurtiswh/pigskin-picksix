import { supabase } from '@/lib/supabase'
import { BlogPost, BlogPostCreate, BlogPostUpdate, SeasonWeekFilter } from '@/types'

export class BlogService {
  // Get published blog posts with optional season/week filter
  static async getPosts(filter?: SeasonWeekFilter, limit = 10, offset = 0): Promise<BlogPost[]> {
    let query = supabase
      .from('blog_posts')
      .select(`
        id,
        title,
        content,
        excerpt,
        author_id,
        season,
        week,
        is_published,
        featured_image_url,
        slug,
        created_at,
        updated_at,
        author:users!blog_posts_author_id_fkey(
          id,
          display_name,
          email
        )
      `)
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    if (filter) {
      query = query.eq('season', filter.season)
      if (filter.week !== undefined) {
        if (filter.week === null) {
          query = query.is('week', null) // Pre-season posts
        } else {
          query = query.eq('week', filter.week)
        }
      }
    }

    if (limit) {
      query = query.range(offset, offset + limit - 1)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching blog posts:', error)
      throw error
    }

    return data || []
  }

  // Get all posts for admin (including unpublished)
  static async getAllPosts(limit = 20, offset = 0): Promise<BlogPost[]> {
    const { data, error } = await supabase
      .from('blog_posts')
      .select(`
        id,
        title,
        content,
        excerpt,
        author_id,
        season,
        week,
        is_published,
        featured_image_url,
        slug,
        created_at,
        updated_at,
        author:users!blog_posts_author_id_fkey(
          id,
          display_name,
          email
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching all blog posts:', error)
      throw error
    }

    return data || []
  }

  // Get single post by slug
  static async getPostBySlug(slug: string): Promise<BlogPost | null> {
    const { data, error } = await supabase
      .from('blog_posts')
      .select(`
        id,
        title,
        content,
        excerpt,
        author_id,
        season,
        week,
        is_published,
        featured_image_url,
        slug,
        created_at,
        updated_at,
        author:users!blog_posts_author_id_fkey(
          id,
          display_name,
          email
        )
      `)
      .eq('slug', slug)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      console.error('Error fetching blog post:', error)
      throw error
    }

    return data
  }

  // Get single post by ID
  static async getPostById(id: string): Promise<BlogPost | null> {
    const { data, error } = await supabase
      .from('blog_posts')
      .select(`
        id,
        title,
        content,
        excerpt,
        author_id,
        season,
        week,
        is_published,
        featured_image_url,
        slug,
        created_at,
        updated_at,
        author:users!blog_posts_author_id_fkey(
          id,
          display_name,
          email
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      console.error('Error fetching blog post:', error)
      throw error
    }

    return data
  }

  // Generate slug from title (client-side fallback)
  private static generateSlug(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'blog-post'
  }

  // Create new blog post
  static async createPost(post: BlogPostCreate): Promise<BlogPost> {
    try {
      // Try to use database function first
      const { data: slugData, error: slugError } = await supabase
        .rpc('generate_blog_slug', { title: post.title })

      let slug = slugData
      if (slugError) {
        console.warn('Database slug function not available, using client-side generation:', slugError)
        // Fallback to client-side slug generation
        slug = this.generateSlug(post.title)
        
        // Check for duplicates manually
        const { data: existing } = await supabase
          .from('blog_posts')
          .select('slug')
          .like('slug', `${slug}%`)
        
        if (existing && existing.length > 0) {
          const counter = existing.length
          slug = `${slug}-${counter}`
        }
      }

      const { data, error } = await supabase
        .from('blog_posts')
        .insert({
          ...post,
          slug,
          author_id: (await supabase.auth.getUser()).data.user?.id
        })
        .select(`
          id,
          title,
          content,
          excerpt,
          author_id,
          season,
          week,
          is_published,
          featured_image_url,
          slug,
          created_at,
          updated_at
        `)
        .single()

      if (error) {
        console.error('Error creating blog post:', error)
        throw error
      }

      return data
    } catch (error) {
      console.error('Failed to create blog post:', error)
      throw error
    }
  }

  // Update blog post
  static async updatePost(id: string, updates: BlogPostUpdate): Promise<BlogPost> {
    let updateData = { ...updates }

    // If title is being updated, regenerate slug
    if (updates.title) {
      try {
        const { data: slugData, error: slugError } = await supabase
          .rpc('generate_blog_slug', { title: updates.title, post_id: id })

        if (slugError) {
          console.warn('Database slug function not available, using client-side generation:', slugError)
          // Fallback to client-side slug generation
          let slug = this.generateSlug(updates.title)
          
          // Check for duplicates manually (excluding current post)
          const { data: existing } = await supabase
            .from('blog_posts')
            .select('slug')
            .like('slug', `${slug}%`)
            .neq('id', id)
          
          if (existing && existing.length > 0) {
            const counter = existing.length
            slug = `${slug}-${counter}`
          }
          
          updateData.slug = slug
        } else {
          updateData.slug = slugData
        }
      } catch (error) {
        console.warn('Error generating slug, keeping existing:', error)
        // Don't update slug if there's an error
        delete updateData.slug
      }
    }

    const { data, error } = await supabase
      .from('blog_posts')
      .update(updateData)
      .eq('id', id)
      .select(`
        id,
        title,
        content,
        excerpt,
        author_id,
        season,
        week,
        is_published,
        featured_image_url,
        slug,
        created_at,
        updated_at
      `)
      .single()

    if (error) {
      console.error('Error updating blog post:', error)
      throw error
    }

    return data
  }

  // Delete blog post
  static async deletePost(id: string): Promise<void> {
    const { error } = await supabase
      .from('blog_posts')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting blog post:', error)
      throw error
    }
  }

  // Get available seasons for blog posts
  static async getAvailableSeasons(): Promise<number[]> {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('season')
      .eq('is_published', true)
      .order('season', { ascending: false })

    if (error) {
      console.error('Error fetching seasons:', error)
      throw error
    }

    const seasons = [...new Set(data?.map(post => post.season) || [])]
    return seasons.sort((a, b) => b - a) // Latest first
  }

  // Get available weeks for a season
  static async getAvailableWeeks(season: number): Promise<(number | null)[]> {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('week')
      .eq('season', season)
      .eq('is_published', true)
      .order('week', { ascending: true, nullsFirst: true })

    if (error) {
      console.error('Error fetching weeks:', error)
      throw error
    }

    const weeks = [...new Set(data?.map(post => post.week) || [])]
    return weeks
  }

  // Get the latest completed week (for defaulting new posts)
  static async getLatestWeek(): Promise<{ season: number; week: number | null }> {
    // This would ideally check against actual game data
    // For now, return current season and a reasonable default
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1

    // Determine season based on month (football season runs Aug-Jan)
    let season = currentYear
    if (currentMonth <= 2) {
      season = currentYear - 1 // Still in previous season if Jan-Feb
    }

    // Default to pre-season in summer, Week 1+ during season
    let week: number | null = null
    if (currentMonth >= 9) {
      // Rough estimate: September starts around Week 1-3
      week = Math.min(Math.max(currentMonth - 8, 1), 15)
    }

    return { season, week }
  }
}