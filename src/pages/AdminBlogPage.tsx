import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Navigate, Link } from 'react-router-dom'
import { BlogPost } from '@/types'
import { BlogService } from '@/services/blogService'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Layout from '@/components/Layout'

export default function AdminBlogPage() {
  const { user } = useAuth()
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)

  // Redirect non-admin users
  if (!user || !user.is_admin) {
    return <Navigate to="/blog" replace />
  }

  useEffect(() => {
    loadPosts()
  }, [])

  const loadPosts = async () => {
    try {
      const allPosts = await BlogService.getAllPosts(50) // Get more posts for admin
      setPosts(allPosts)
    } catch (error) {
      console.error('Failed to load posts:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this blog post? This action cannot be undone.')) {
      return
    }

    try {
      await BlogService.deletePost(postId)
      setPosts(posts.filter(post => post.id !== postId))
    } catch (error) {
      console.error('Failed to delete post:', error)
      alert('Failed to delete post. Please try again.')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getWeekLabel = (week: number | null) => {
    return week === null ? 'Pre-season' : `Week ${week}`
  }

  return (
    <Layout>
      {/* Page Header */}
      <div className="bg-pigskin-500 text-white py-6">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Blog Management</h1>
              <p className="text-pigskin-100">Create and manage blog posts</p>
            </div>
            <Link to="/admin/blog/new">
              <Button className="bg-gold-500 hover:bg-gold-600 text-pigskin-900">
                Create New Post
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Actions */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold text-charcoal-900">All Posts ({posts.length})</h2>
            <p className="text-charcoal-600">Manage published and draft blog posts</p>
          </div>
          <div className="flex gap-2">
            <Link to="/blog">
              <Button variant="outline">
                View Public Blog
              </Button>
            </Link>
            <Button onClick={loadPosts} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="text-charcoal-600">Loading posts...</div>
          </div>
        )}

        {/* Posts List */}
        {!loading && (
          <div className="space-y-4">
            {posts.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <p className="text-charcoal-600 mb-4">No blog posts found.</p>
                  <Link to="/admin/blog/new">
                    <Button>Create Your First Post</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              posts.map((post) => (
                <Card key={post.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <h3 className="text-lg font-semibold text-charcoal-900">
                            {post.title}
                          </h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            post.is_published 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {post.is_published ? 'Published' : 'Draft'}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-charcoal-500 mb-3">
                          <span>{post.season}</span>
                          <span>•</span>
                          <span>{getWeekLabel(post.week)}</span>
                          <span>•</span>
                          <span>Created: {formatDate(post.created_at)}</span>
                          {post.updated_at !== post.created_at && (
                            <>
                              <span>•</span>
                              <span>Updated: {formatDate(post.updated_at)}</span>
                            </>
                          )}
                        </div>

                        {post.excerpt && (
                          <p className="text-charcoal-600 text-sm mb-3 line-clamp-2">
                            {post.excerpt}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        {post.is_published && (
                          <Link to={`/blog/${post.slug}`}>
                            <Button variant="outline" size="sm">
                              View
                            </Button>
                          </Link>
                        )}
                        <Link to={`/admin/blog/edit/${post.id}`}>
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                        </Link>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDelete(post.id)}
                          className="text-red-600 hover:text-red-700 hover:border-red-300"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </main>
    </Layout>
  )
}