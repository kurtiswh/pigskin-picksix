import { useState, useEffect } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { BlogPost } from '@/types'
import { DirectBlogService } from '@/services/directBlogService'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Paperclip, Download, FileText } from 'lucide-react'
import Layout from '@/components/Layout'
import '@/styles/quill-content.css'

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) {
      setNotFound(true)
      setLoading(false)
      return
    }

    const loadPost = async () => {
      try {
        const blogPost = await DirectBlogService.getPostBySlug(slug)
        if (blogPost) {
          setPost(blogPost)
        } else {
          setNotFound(true)
        }
      } catch (error) {
        console.error('Failed to load blog post:', error)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }

    loadPost()
  }, [slug])

  if (loading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="text-center py-12">
            <div className="text-charcoal-600">Loading post...</div>
          </div>
        </div>
      </Layout>
    )
  }

  if (notFound || !post) {
    return <Navigate to="/blog" replace />
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getWeekLabel = (week: number | null) => {
    return week === null ? 'Pre-season' : `Week ${week}`
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Back to Blog */}
        <div className="mb-6">
          <Link
            to="/blog"
            className="inline-flex items-center text-pigskin-600 hover:text-pigskin-700 transition-colors"
          >
            <svg
              className="w-4 h-4 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Blog
          </Link>
        </div>

        <article>
          {/* Post Header */}
          <header className="mb-8">
            <div className="flex items-center gap-2 text-sm text-charcoal-500 mb-4">
              <span className="font-medium">{post.season}</span>
              <span>•</span>
              <span>{getWeekLabel(post.week)}</span>
              <span>•</span>
              <span>{formatDate(post.created_at)}</span>
              {post.author && (
                <>
                  <span>•</span>
                  <span>by {post.author.display_name}</span>
                </>
              )}
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-charcoal-900 mb-4 leading-tight">
              {post.title}
            </h1>

            {post.excerpt && (
              <p className="text-lg text-charcoal-600 leading-relaxed">
                {post.excerpt}
              </p>
            )}
          </header>

          {/* Featured Image */}
          {post.featured_image_url && (
            <div className="mb-8">
              <img
                src={post.featured_image_url}
                alt={post.title}
                className="w-full h-64 md:h-96 object-cover rounded-lg shadow-lg"
              />
            </div>
          )}

          {/* Post Content */}
          <Card>
            <CardContent className="p-6 md:p-8">
              <div
                className="prose prose-lg prose-charcoal max-w-none blog-content"
                dangerouslySetInnerHTML={{ __html: post.content }}
              />
            </CardContent>
          </Card>

          {/* Attachments Section */}
          {post.attachments && post.attachments.length > 0 && (
            <Card className="mt-6 border-blue-200 bg-blue-50/30">
              <CardContent className="p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <Paperclip className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Attachments ({post.attachments.length})
                  </h3>
                </div>
                <div className="space-y-2">
                  {post.attachments.map((attachment, index) => (
                    <a
                      key={index}
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 bg-white border border-blue-200 rounded-lg hover:border-blue-400 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center space-x-3">
                        <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                            {attachment.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {attachment.type} • {(attachment.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>
                      <Download className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Post Footer */}
          <footer className="mt-8 pt-6 border-t border-stone-200">
            <div className="flex justify-between items-center">
              <div className="text-sm text-charcoal-500">
                Last updated: {formatDate(post.updated_at)}
              </div>
              <Link to="/blog">
                <Button variant="outline">
                  More Posts
                </Button>
              </Link>
            </div>
          </footer>
        </article>
      </div>
    </Layout>
  )
}