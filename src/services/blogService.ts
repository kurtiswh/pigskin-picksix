import { supabase } from '@/lib/supabase'
import { BlogPost, BlogPostCreate, BlogPostUpdate, SeasonWeekFilter } from '@/types'

export class BlogService {
  // Get published blog posts with optional season/week filter
  static async getPosts(filter?: SeasonWeekFilter, limit = 10, offset = 0): Promise<BlogPost[]> {
    console.log('BlogService.getPosts called with filter:', filter)
    
    try {
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

      console.log('Executing blog posts query...')
      const { data, error } = await query

      if (error) {
        console.error('Error fetching blog posts:', error)
        
        // If RLS is blocking, try a simpler query without joins
        console.log('Trying simpler query without author join...')
        let simpleQuery = supabase
          .from('blog_posts')
          .select('*')
          .eq('is_published', true)
          .order('created_at', { ascending: false })

        if (filter) {
          simpleQuery = simpleQuery.eq('season', filter.season)
          if (filter.week !== undefined) {
            if (filter.week === null) {
              simpleQuery = simpleQuery.is('week', null)
            } else {
              simpleQuery = simpleQuery.eq('week', filter.week)
            }
          }
        }

        if (limit) {
          simpleQuery = simpleQuery.range(offset, offset + limit - 1)
        }

        const { data: simpleData, error: simpleError } = await simpleQuery

        if (simpleError) {
          console.error('Simple query also failed:', simpleError)
          throw simpleError
        }

        console.log('Simple query succeeded, got', simpleData?.length, 'posts')
        return simpleData || []
      }

      console.log('Query succeeded, got', data?.length, 'posts')
      return data || []
    } catch (error) {
      console.error('BlogService.getPosts failed:', error)
      throw error
    }
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
  static async createPost(post: BlogPostCreate, authorId?: string): Promise<BlogPost> {
    console.log('BlogService.createPost called with:', post)
    
    try {
      // Get user ID - either passed in or from auth
      let userId = authorId
      if (!userId) {
        // Get current user with timeout
        try {
          const userPromise = supabase.auth.getUser()
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('getUser timeout')), 5000)
          )
          
          const { data: { user: authUser }, error: userError } = await Promise.race([
            userPromise,
            timeoutPromise
          ]) as any
          
          if (userError || !authUser) {
            throw new Error(`User not authenticated: ${userError?.message || 'No user found'}`)
          }
          
          userId = authUser.id
          console.log('Current user from auth:', userId)
        } catch (authError) {
          console.error('Auth error:', authError)
          // Fallback: try to get user from session
          const session = await supabase.auth.getSession()
          if (session.data.session?.user) {
            userId = session.data.session.user.id
            console.log('Got user from session:', userId)
          } else {
            throw new Error('Unable to get authenticated user')
          }
        }
      } else {
        console.log('Using provided user ID:', userId)
      }

      // Generate slug client-side (skip database function and duplicate check for now)
      console.log('Generating slug for title:', post.title)
      let slug = this.generateSlug(post.title)
      
      // Add timestamp to make it unique
      const timestamp = Date.now().toString().slice(-4)
      slug = `${slug}-${timestamp}`
      
      console.log('Generated unique slug:', slug)

      const insertData = {
        ...post,
        slug,
        author_id: userId
      }
      
      console.log('Inserting blog post:', insertData)

      // First, test if the table exists with a simple query
      try {
        console.log('Testing table access...')
        const testPromise = supabase.from('blog_posts').select('count').limit(1)
        const testTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Table test timeout')), 5000)
        )
        await Promise.race([testPromise, testTimeout])
        console.log('Table access confirmed')
      } catch (testError) {
        console.error('Table access failed:', testError)
        throw new Error(`Blog posts table is not accessible: ${testError}. Please ensure the database migration has been applied.`)
      }

      // Insert with timeout
      const insertPromise = supabase
        .from('blog_posts')
        .insert(insertData)
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

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Insert operation timeout after 15 seconds')), 15000)
      )

      const { data, error } = await Promise.race([insertPromise, timeoutPromise]) as any

      if (error) {
        console.error('Error creating blog post:', error)
        throw error
      }

      console.log('Blog post created successfully:', data)
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