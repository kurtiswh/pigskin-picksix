import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Navigate, useParams, useNavigate } from 'react-router-dom'
import { BlogPost, BlogPostCreate, BlogPostUpdate } from '@/types'
import { DirectBlogService } from '@/services/directBlogService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import Layout from '@/components/Layout'
import { sendRecapTest, sendRecapToAll, type RecapSendProgress } from '@/services/recapService'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import '@/styles/quill-content.css'

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

  // Recap email-to-players state
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [emailMsg, setEmailMsg] = useState('')
  const [sendingAll, setSendingAll] = useState(false)
  const [sendProgress, setSendProgress] = useState<RecapSendProgress | null>(null)

  useEffect(() => { if (user?.email) setTestEmail(user.email) }, [user?.email])

  const emailPost = (): BlogPost | null => (post ? { ...post, title, excerpt, week, season } : null)

  const handleTestEmail = async () => {
    const p = emailPost(); if (!p) return
    setTestSending(true); setEmailMsg('')
    try {
      const ok = await sendRecapTest(testEmail.trim(), p)
      setEmailMsg(ok ? `✅ Test sent to ${testEmail}` : '❌ Test failed to send')
    } catch (e: any) { setEmailMsg(`❌ ${e?.message || 'Test failed'}`) } finally { setTestSending(false) }
  }

  const handleSendAll = async () => {
    const p = emailPost(); if (!p) return
    if (!confirm(`Send the Week ${p.week} recap to all paid players? This emails everyone playing for ${p.season}.`)) return
    setSendingAll(true); setEmailMsg(''); setSendProgress(null)
    try {
      const res = await sendRecapToAll(p, prog => setSendProgress(prog))
      setEmailMsg(`✅ Sent ${res.sent} of ${res.total}${res.failed ? ` (${res.failed} failed)` : ''}`)
      if (post) setPost({ ...post, emailed_at: new Date().toISOString() })
    } catch (e: any) { setEmailMsg(`❌ ${e?.message || 'Send failed'}`) } finally { setSendingAll(false) }
  }

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
      console.log('BlogEditorPage: Loading post for editing, ID:', postId)
      const blogPost = await DirectBlogService.getPostById(postId)
      
      if (blogPost) {
        console.log('BlogEditorPage: Successfully loaded post:', blogPost.title)
        setPost(blogPost)
        setTitle(blogPost.title)
        setContent(blogPost.content)
        setExcerpt(blogPost.excerpt || '')
        setSeason(blogPost.season)
        setWeek(blogPost.week)
        setIsPublished(blogPost.is_published)
        setFeaturedImageUrl(blogPost.featured_image_url || '')
      } else {
        console.error('BlogEditorPage: Post not found with ID:', postId)
        alert('Blog post not found')
        navigate('/blog')
      }
    } catch (error) {
      console.error('BlogEditorPage: Failed to load post:', error)
      alert('Error loading blog post')
      navigate('/blog')
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
      console.log('Saving blog post...', { title, content: content.substring(0, 100) + '...', season, week })
      
      const postData = {
        title: title.trim(),
        content: content.trim(),
        excerpt: excerpt.trim() || undefined,
        season,
        week,
        is_published: publishNow || isPublished,
        featured_image_url: featuredImageUrl.trim() || undefined
      }

      let result
      if (isEditing && postId) {
        // Update existing post
        console.log('Updating post:', postId)
        result = await DirectBlogService.updatePost(postId, postData as BlogPostUpdate)
      } else {
        // Create new post
        console.log('Creating new post')
        result = await DirectBlogService.createPost(postData as BlogPostCreate, user.id)
      }
      
      console.log('Save successful:', result)
      navigate('/blog')
    } catch (error) {
      console.error('Failed to save post:', error)
      alert(`Failed to save blog post: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`)
    } finally {
      setSaving(false)
    }
  }

  const generateExcerpt = () => {
    if (content.trim()) {
      // Strip HTML tags and get plain text
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = content
      const plainText = tempDiv.textContent || tempDiv.innerText || ''
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
              onClick={() => navigate('/blog')}
            >
              ← Back to Blog
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
                    Content *
                  </label>
                  <div className="bg-white border border-gray-300 rounded-md">
                    <ReactQuill
                      value={content}
                      onChange={setContent}
                      placeholder="Write your blog post content here..."
                      style={{ minHeight: '400px' }}
                      modules={{
                        toolbar: [
                          [{ 'header': [1, 2, 3, false] }],
                          ['bold', 'italic', 'underline', 'strike'],
                          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                          ['blockquote', 'code-block'],
                          ['link', 'image'],
                          ['clean']
                        ]
                      }}
                      formats={[
                        'header', 'bold', 'italic', 'underline', 'strike',
                        'list', 'bullet', 'blockquote', 'code-block',
                        'link', 'image'
                      ]}
                    />
                  </div>
                  <div className="text-xs text-charcoal-500 mt-1">
                    Rich text editor with formatting options
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
                    onClick={() => navigate('/blog')}
                    className="w-full"
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Email recap to players (weekly recap posts only) */}
            {isEditing && week != null && (
              <Card>
                <CardHeader><CardTitle className="text-base">📧 Email to players</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {!isPublished ? (
                    <p className="text-sm text-charcoal-600">Publish the post first, then you can email it to the season's players.</p>
                  ) : (
                    <>
                      {post?.emailed_at && (
                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                          Already emailed {new Date(post.emailed_at).toLocaleString()}. Sending again will re-send to everyone.
                        </div>
                      )}
                      <p className="text-sm text-charcoal-600">
                        Sends a <b>personalized</b> recap (each player's own results) + your excerpt as the rundown + a link to this post.
                        Only paid/entered players for {season}.
                      </p>
                      <div>
                        <label className="text-xs font-medium text-charcoal-700">Send a test to</label>
                        <div className="flex gap-2 mt-1">
                          <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} className="flex-1" />
                          <Button variant="outline" onClick={handleTestEmail} disabled={testSending || !testEmail.trim()}>
                            {testSending ? 'Sending…' : 'Send test'}
                          </Button>
                        </div>
                      </div>
                      <Button onClick={handleSendAll} disabled={sendingAll} className="w-full bg-pigskin-600 hover:bg-pigskin-700 text-white">
                        {sendingAll ? 'Sending…' : '🚀 Send to all paid players'}
                      </Button>
                      {sendProgress && (
                        <div className="text-xs text-charcoal-600">Sent {sendProgress.sent}/{sendProgress.total}{sendProgress.failed ? ` · ${sendProgress.failed} failed` : ''}</div>
                      )}
                      {emailMsg && <div className="text-sm">{emailMsg}</div>}
                      <p className="text-[11px] text-charcoal-400">Tip: save the post (so your latest excerpt is used) before sending.</p>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </Layout>
  )
}