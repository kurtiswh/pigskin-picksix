import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Navigate, useParams, useNavigate } from 'react-router-dom'
import { BlogPost, BlogPostCreate, BlogPostUpdate } from '@/types'
import { BlogService } from '@/services/blogService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import Layout from '@/components/Layout'

export default function BlogEditorPage() {
  const { user } = useAuth()
  const { postId } = useParams<{ postId: string }>()
  const navigate = useNavigate()
  const isEditing = postId !== 'new'

  const [post, setPost] = useState<BlogPost | null>(null)
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  
  // Form state
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [season, setSeason] = useState<number>(new Date().getFullYear())
  const [week, setWeek] = useState<number | null>(null)
  const [isPublished, setIsPublished] = useState(false)
  const [featuredImageUrl, setFeaturedImageUrl] = useState('')

  // Redirect non-admin users
  if (!user || !user.is_admin) {
    return <Navigate to="/blog" replace />
  }

  useEffect(() => {
    if (isEditing && postId) {
      loadPost()
    } else {
      // Set defaults for new post
      const currentYear = new Date().getFullYear()
      const currentMonth = new Date().getMonth() + 1
      
      setSeason(currentYear)
      // Default to pre-season in summer, current week during season
      if (currentMonth >= 9) {
        setWeek(Math.min(Math.max(currentMonth - 8, 1), 15))
      }
      setLoading(false)
    }
  }, [isEditing, postId])

  const loadPost = async () => {
    if (!postId) return

    try {
      const blogPost = await BlogService.getPostById(postId)
      if (blogPost) {
        setPost(blogPost)
        setTitle(blogPost.title)
        setContent(blogPost.content)
        setExcerpt(blogPost.excerpt || '')
        setSeason(blogPost.season)
        setWeek(blogPost.week)
        setIsPublished(blogPost.is_published)
        setFeaturedImageUrl(blogPost.featured_image_url || '')
      } else {
        alert('Blog post not found')
        navigate('/admin/blog')
      }
    } catch (error) {
      console.error('Failed to load post:', error)
      alert('Failed to load blog post')
      navigate('/admin/blog')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (publishNow = false) => {
    if (!title.trim() || !content.trim()) {
      alert('Title and content are required')
      return
    }

    setSaving(true)
    try {
      const postData = {
        title: title.trim(),
        content: content.trim(),
        excerpt: excerpt.trim() || undefined,
        season,
        week,
        is_published: publishNow || isPublished,
        featured_image_url: featuredImageUrl.trim() || undefined
      }

      if (isEditing && postId) {
        // Update existing post
        await BlogService.updatePost(postId, postData as BlogPostUpdate)
      } else {
        // Create new post
        await BlogService.createPost(postData as BlogPostCreate)
      }

      navigate('/admin/blog')
    } catch (error) {
      console.error('Failed to save post:', error)
      alert('Failed to save blog post. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const generateExcerpt = () => {
    if (content.trim()) {
      // Simple excerpt generation - take first 150 chars of content, excluding markdown
      const plainText = content.replace(/[#*`_\[\]]/g, '').trim()
      const excerpt = plainText.substring(0, 150) + (plainText.length > 150 ? '...' : '')
      setExcerpt(excerpt)
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <div className="text-charcoal-600">Loading post...</div>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* Page Header */}
      <div className="bg-pigskin-500 text-white py-6">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">
                {isEditing ? 'Edit Blog Post' : 'Create New Blog Post'}
              </h1>
              <p className="text-pigskin-100">
                {isEditing ? 'Update your blog post' : 'Write a new blog post'}
              </p>
            </div>
            <Button
              variant="outline"
              className="border-white text-white hover:bg-white hover:text-pigskin-500"
              onClick={() => navigate('/admin/blog')}
            >
              ← Back to Blog Management
            </Button>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Editor */}
          <div className="lg:col-span-2 space-y-6">
            {/* Title */}
            <Card>
              <CardHeader>
                <CardTitle>Post Content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal-700 mb-1">
                    Title *
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter post title..."
                    maxLength={200}
                  />
                  <div className="text-xs text-charcoal-500 mt-1">
                    {title.length}/200 characters
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-charcoal-700 mb-1">
                    Content * (Markdown supported)
                  </label>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write your blog post content here... You can use Markdown formatting."
                    rows={20}
                    className="font-mono text-sm"
                  />
                  <div className="text-xs text-charcoal-500 mt-1">
                    Supports Markdown: **bold**, *italic*, # headers, - lists, etc.
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="block text-sm font-medium text-charcoal-700">
                      Excerpt
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={generateExcerpt}
                      disabled={!content.trim()}
                    >
                      Auto-generate
                    </Button>
                  </div>
                  <Textarea
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                    placeholder="Brief description of the post (optional)"
                    rows={3}
                    maxLength={300}
                  />
                  <div className="text-xs text-charcoal-500 mt-1">
                    {excerpt.length}/300 characters - shown in post listings
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Publish Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Publish Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-charcoal-700">
                    Published
                  </label>
                  <Switch
                    checked={isPublished}
                    onCheckedChange={setIsPublished}
                  />
                </div>
                
                <div className="text-xs text-charcoal-500">
                  {isPublished 
                    ? 'Post is visible to the public' 
                    : 'Post is saved as draft'
                  }
                </div>
              </CardContent>
            </Card>

            {/* Post Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Post Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal-700 mb-1">
                    Season *
                  </label>
                  <Input
                    type="number"
                    value={season}
                    onChange={(e) => setSeason(parseInt(e.target.value) || new Date().getFullYear())}
                    min={2020}
                    max={2030}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-charcoal-700 mb-1">
                    Week
                  </label>
                  <Select
                    value={week === null ? 'preseason' : week.toString()}
                    onValueChange={(value) => setWeek(value === 'preseason' ? null : parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preseason">Pre-season</SelectItem>
                      {Array.from({ length: 15 }, (_, i) => i + 1).map((weekNum) => (
                        <SelectItem key={weekNum} value={weekNum.toString()}>
                          Week {weekNum}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-charcoal-700 mb-1">
                    Featured Image URL
                  </label>
                  <Input
                    type="url"
                    value={featuredImageUrl}
                    onChange={(e) => setFeaturedImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                  />
                  <div className="text-xs text-charcoal-500 mt-1">
                    Optional image to display with the post
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <Button
                    onClick={() => handleSave(true)}
                    disabled={saving || !title.trim() || !content.trim()}
                    className="w-full"
                  >
                    {saving ? 'Saving...' : 'Save & Publish'}
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => handleSave(false)}
                    disabled={saving || !title.trim() || !content.trim()}
                    className="w-full"
                  >
                    {saving ? 'Saving...' : 'Save as Draft'}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => navigate('/admin/blog')}
                    className="w-full"
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </Layout>
  )
}