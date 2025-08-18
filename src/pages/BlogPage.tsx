import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BlogPost, SeasonWeekFilter } from '@/types'
import { DirectBlogService } from '@/services/directBlogService'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Layout from '@/components/Layout'

export default function BlogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [seasons, setSeasons] = useState<number[]>([])
  const [weeks, setWeeks] = useState<(number | null)[]>([])
  const [selectedSeason, setSelectedSeason] = useState<number>()
  const [selectedWeek, setSelectedWeek] = useState<number | null | undefined>()

  // Initialize filters from URL params
  useEffect(() => {
    const season = searchParams.get('season')
    const week = searchParams.get('week')

    if (season) {
      setSelectedSeason(parseInt(season))
    }
    if (week) {
      setSelectedWeek(week === 'preseason' ? null : parseInt(week))
    }
  }, [searchParams])

  // Load available seasons
  useEffect(() => {
    const loadSeasons = async () => {
      try {
        // For now, set default seasons - can be enhanced later
        const currentYear = new Date().getFullYear()
        const defaultSeasons = [currentYear, currentYear - 1, currentYear - 2]
        setSeasons(defaultSeasons)

        // Set default season if none selected
        if (!selectedSeason) {
          setSelectedSeason(currentYear)
        }
      } catch (error) {
        console.error('Failed to load seasons:', error)
      }
    }

    loadSeasons()
  }, [selectedSeason])

  // Load available weeks when season changes
  useEffect(() => {
    if (!selectedSeason) return

    const loadWeeks = async () => {
      try {
        // For now, set default weeks 1-14 plus preseason
        const defaultWeeks = [null, ...Array.from({length: 14}, (_, i) => i + 1)]
        setWeeks(defaultWeeks)
      } catch (error) {
        console.error('Failed to load weeks:', error)
      }
    }

    loadWeeks()
  }, [selectedSeason])

  // Load posts when filters change
  useEffect(() => {
    const loadPosts = async () => {
      setLoading(true)
      try {
        const filter: SeasonWeekFilter | undefined = selectedSeason
          ? {
              season: selectedSeason,
              week: selectedWeek
            }
          : undefined

        const blogPosts = await DirectBlogService.getPosts(filter?.season, filter?.week, 20)
        setPosts(blogPosts)
      } catch (error) {
        console.error('Failed to load blog posts:', error)
      } finally {
        setLoading(false)
      }
    }

    loadPosts()
  }, [selectedSeason, selectedWeek])

  const handleSeasonChange = (season: string) => {
    const newSeason = parseInt(season)
    setSelectedSeason(newSeason)
    setSelectedWeek(undefined) // Reset week when season changes

    // Update URL
    const newParams = new URLSearchParams(searchParams)
    newParams.set('season', season)
    newParams.delete('week')
    setSearchParams(newParams)
  }

  const handleWeekChange = (week: string) => {
    const newWeek = week === 'preseason' ? null : parseInt(week)
    setSelectedWeek(newWeek)

    // Update URL
    const newParams = new URLSearchParams(searchParams)
    if (newWeek === null) {
      newParams.set('week', 'preseason')
    } else {
      newParams.set('week', newWeek.toString())
    }
    setSearchParams(newParams)
  }

  const clearFilters = () => {
    setSelectedSeason(undefined)
    setSelectedWeek(undefined)
    setSearchParams({})
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
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-charcoal-900 mb-2">
              Pigskin Pick Six Pro Blog
            </h1>
            <p className="text-charcoal-600">
              Analysis, insights, and commentary on college football pick 'em
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Filter Posts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="min-w-[120px]">
                <label className="block text-sm font-medium text-charcoal-700 mb-1">
                  Season
                </label>
                <Select
                  value={selectedSeason?.toString()}
                  onValueChange={handleSeasonChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All seasons" />
                  </SelectTrigger>
                  <SelectContent>
                    {seasons.map((season) => (
                      <SelectItem key={season} value={season.toString()}>
                        {season}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSeason && (
                <div className="min-w-[140px]">
                  <label className="block text-sm font-medium text-charcoal-700 mb-1">
                    Week
                  </label>
                  <Select
                    value={
                      selectedWeek === null
                        ? 'preseason'
                        : selectedWeek?.toString() || 'all'
                    }
                    onValueChange={handleWeekChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All weeks" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All weeks</SelectItem>
                      {weeks.map((week) => (
                        <SelectItem
                          key={week === null ? 'preseason' : week}
                          value={week === null ? 'preseason' : week.toString()}
                        >
                          {getWeekLabel(week)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(selectedSeason || selectedWeek !== undefined) && (
                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8">
            <div className="text-charcoal-600">Loading posts...</div>
          </div>
        )}

        {/* Posts */}
        {!loading && (
          <div className="space-y-6">
            {posts.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <p className="text-charcoal-600 mb-4">
                    No blog posts found for the selected filters.
                  </p>
                  <Button variant="outline" onClick={clearFilters}>
                    View All Posts
                  </Button>
                </CardContent>
              </Card>
            ) : (
              posts.map((post) => (
                <Card key={post.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2 text-sm text-charcoal-500">
                        <span className="font-medium">{post.season}</span>
                        <span>•</span>
                        <span>{getWeekLabel(post.week)}</span>
                        <span>•</span>
                        <span>{formatDate(post.created_at)}</span>
                      </div>
                      {post.author && (
                        <div className="text-sm text-charcoal-500">
                          by {post.author.display_name}
                        </div>
                      )}
                    </div>

                    <h2 className="text-xl font-bold text-charcoal-900 mb-3">
                      <Link
                        to={`/blog/${post.slug}`}
                        className="hover:text-pigskin-600 transition-colors"
                      >
                        {post.title}
                      </Link>
                    </h2>

                    {post.excerpt && (
                      <p className="text-charcoal-600 mb-4 leading-relaxed">
                        {post.excerpt}
                      </p>
                    )}

                    <Link
                      to={`/blog/${post.slug}`}
                      className="inline-flex items-center text-pigskin-600 hover:text-pigskin-700 font-medium transition-colors"
                    >
                      Read more
                      <svg
                        className="w-4 h-4 ml-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </Link>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}