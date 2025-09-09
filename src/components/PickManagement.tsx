import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { 
  ChevronDown, 
  ChevronUp, 
  Users, 
  UserX, 
  Eye, 
  EyeOff, 
  AlertTriangle,
  Copy,
  Check,
  X,
  Edit,
  Save,
  MessageSquare
} from 'lucide-react'

interface PickManagementProps {
  currentWeek: number
  currentSeason: number
}

interface UnassignedAnonymousPicks {
  id: string
  identifier: string
  season: number
  week: number
  picks: any[]
  created_at: string
  validation_status: string
  user_name?: string
  user_email?: string
  processing_notes?: string
}

interface HiddenPicks {
  user_id: string
  display_name: string
  week: number
  pick_count: number
  hidden_count: number
  pick_type: 'auth' | 'anon'
  submitted_at?: string
  user_email?: string
  profile_email?: string  // Email from the user's profile
  leaguesafe_email?: string  // Email from LeagueSafe payments
  assigned_user_id?: string
  processing_notes?: string
  pick_ids?: string[]  // To track individual pick IDs for updates
}

interface UnsubmittedPickSet {
  user_id: string
  display_name: string
  email: string
  week: number
  pick_type: 'auth' | 'anon'
  unsubmitted_count: number
  picks: Array<{
    pick_id: string
    game_matchup: string
    selected_team: string
    created_at: string
  }>
  has_submitted_anonymous?: boolean
}

interface MultiplePickSets {
  user_id: string
  display_name: string
  week: number
  auth_picks: number
  anon_picks: number
  selected_type: string | null
}

interface SubmittedUnpaidPickSet {
  user_id: string
  display_name: string
  email: string
  week: number
  pick_type: 'auth' | 'anon'
  submitted_count: number
  total_points: number
  payment_status: string
  picks: Array<{
    pick_id: string
    game_matchup: string
    selected_team: string
    result?: 'win' | 'loss' | 'push'
    points_earned: number
    submitted_at: string
  }>
}

interface PickSetDetails {
  type: 'auth' | 'anon'
  picks: any[]
  show_on_leaderboard: boolean
  submitted: boolean
  submitted_at?: string
  individualPickVisibility?: { [pickId: string]: boolean }
}

export default function PickManagement({ currentWeek, currentSeason }: PickManagementProps) {
  const [selectedWeek, setSelectedWeek] = useState(currentWeek.toString())
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  
  // Data states
  const [unassignedAnon, setUnassignedAnon] = useState<UnassignedAnonymousPicks[]>([])
  const [hiddenAnonPicks, setHiddenAnonPicks] = useState<HiddenPicks[]>([])
  const [hiddenAuthPicks, setHiddenAuthPicks] = useState<HiddenPicks[]>([])
  const [unsubmittedPickSets, setUnsubmittedPickSets] = useState<UnsubmittedPickSet[]>([])
  const [multiplePickSets, setMultiplePickSets] = useState<MultiplePickSets[]>([])
  const [submittedUnpaidPickSets, setSubmittedUnpaidPickSets] = useState<SubmittedUnpaidPickSet[]>([])
  
  // Note editing states
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [tempNote, setTempNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  
  // Modal state for managing multiple pick sets
  const [managingPickSets, setManagingPickSets] = useState<MultiplePickSets | null>(null)
  const [pickSetDetails, setPickSetDetails] = useState<{ auth?: PickSetDetails, anon?: PickSetDetails }>({})
  const [updatingPickSets, setUpdatingPickSets] = useState(false)
  
  // Section collapse states
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    unassigned: false,
    hiddenAnon: false,
    hiddenAuth: false,
    unsubmitted: false,
    multiple: false,
    submittedUnpaid: false
  })
  
  // Load all data
  const loadAllData = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      const week = parseInt(selectedWeek)
      console.log('🔄 Loading Pick Management data for week', week)
      
      // Load unassigned anonymous picks - they have name and email fields directly
      const { data: unassigned, error: unassignedError } = await supabase
        .from('anonymous_picks')
        .select('*')
        .eq('season', currentSeason)
        .eq('week', week)
        .is('assigned_user_id', null)
        .order('created_at', { ascending: false })
      
      if (unassignedError) throw unassignedError
      
      // Group anonymous picks by email/name since there's one row per pick
      const groupedUnassigned: { [key: string]: UnassignedAnonymousPicks } = {}
      
      ;(unassigned || []).forEach(pick => {
        // Use email as the key for grouping
        const key = `${pick.email}-${pick.week}`
        
        if (!groupedUnassigned[key]) {
          groupedUnassigned[key] = {
            id: key, // Use composite key as ID
            identifier: pick.identifier || `${pick.name} <${pick.email}>`,
            season: pick.season,
            week: pick.week,
            picks: [],
            created_at: pick.created_at,
            validation_status: pick.validation_status || 'pending',
            user_name: pick.name || '',
            user_email: pick.email || '',
            processing_notes: pick.processing_notes || ''
          }
        }
        
        // Add this pick to the group
        groupedUnassigned[key].picks.push(pick)
        
        // Update created_at to the earliest submission
        if (new Date(pick.created_at) < new Date(groupedUnassigned[key].created_at)) {
          groupedUnassigned[key].created_at = pick.created_at
        }
        
        // Use the first non-empty processing note found
        if (pick.processing_notes && !groupedUnassigned[key].processing_notes) {
          groupedUnassigned[key].processing_notes = pick.processing_notes
        }
      })
      
      setUnassignedAnon(Object.values(groupedUnassigned))
      
      // Load picks with show_on_leaderboard = false
      // Anonymous picks
      const { data: hiddenAnon, error: hiddenAnonError } = await supabase
        .from('anonymous_picks')
        .select(`
          id,
          assigned_user_id,
          week,
          show_on_leaderboard,
          created_at,
          email,
          name,
          processing_notes,
          users!anonymous_picks_assigned_user_id_fkey (
            display_name,
            email,
            leaguesafe_email
          )
        `)
        .eq('season', currentSeason)
        .eq('week', week)
        .eq('show_on_leaderboard', false)
        .not('assigned_user_id', 'is', null)
      
      if (hiddenAnonError) throw hiddenAnonError
      
      console.log('🔍 Raw hidden anonymous picks data:', hiddenAnon)
      
      const formattedHiddenAnon: HiddenPicks[] = (hiddenAnon || []).reduce((acc: HiddenPicks[], pick: any) => {
        const existing = acc.find(p => p.user_id === pick.assigned_user_id && p.week === pick.week)
        if (existing) {
          existing.pick_count++
          existing.hidden_count++
          // Keep the earliest submission time
          if (pick.created_at && (!existing.submitted_at || new Date(pick.created_at) < new Date(existing.submitted_at))) {
            existing.submitted_at = pick.created_at
          }
          // Add pick ID to the list
          if (existing.pick_ids) {
            existing.pick_ids.push(pick.id)
          }
          // Update profile email if not set and this pick has one
          if (!existing.profile_email && pick.users?.email) {
            existing.profile_email = pick.users.email
          }
        } else {
          const submissionEmail = pick.email || ''
          const profileEmail = pick.users?.email || ''
          
          // Debug logging for Tyler Meier case
          if (pick.users?.display_name?.toLowerCase().includes('tyler')) {
            console.log('🔍 Tyler Meier debug:', {
              display_name: pick.users?.display_name,
              submission_email: submissionEmail,
              profile_email: profileEmail,
              leaguesafe_email: pick.users?.leaguesafe_email,
              users_object: pick.users,
              user_id: pick.assigned_user_id
            })
          }
          
          acc.push({
            user_id: pick.assigned_user_id,
            display_name: pick.users?.display_name || 'Unknown',
            week: pick.week,
            pick_count: 1,
            hidden_count: 1,
            pick_type: 'anon',
            submitted_at: pick.created_at,
            user_email: submissionEmail,  // Email from anonymous submission
            profile_email: profileEmail,  // Email from user's profile
            leaguesafe_email: pick.users?.leaguesafe_email || '', // Email from LeagueSafe
            assigned_user_id: pick.assigned_user_id,
            processing_notes: pick.processing_notes || '',
            pick_ids: [pick.id]
          })
        }
        return acc
      }, [])
      
      // Hidden anonymous picks will be filtered later after multiple pick sets are calculated
      
      // Authenticated picks
      const { data: hiddenAuth, error: hiddenAuthError } = await supabase
        .from('picks')
        .select(`
          user_id,
          week,
          show_on_leaderboard,
          created_at,
          users!picks_user_id_fkey (
            display_name
          )
        `)
        .eq('season', currentSeason)
        .eq('week', week)
        .eq('show_on_leaderboard', false)
      
      if (hiddenAuthError) throw hiddenAuthError
      
      const formattedHiddenAuth: HiddenPicks[] = (hiddenAuth || []).reduce((acc: HiddenPicks[], pick: any) => {
        const existing = acc.find(p => p.user_id === pick.user_id && p.week === pick.week)
        if (existing) {
          existing.pick_count++
          existing.hidden_count++
          // Keep the earliest submission time
          if (pick.created_at && (!existing.submitted_at || new Date(pick.created_at) < new Date(existing.submitted_at))) {
            existing.submitted_at = pick.created_at
          }
        } else {
          acc.push({
            user_id: pick.user_id,
            display_name: pick.users?.display_name || 'Unknown',
            week: pick.week,
            pick_count: 1,
            hidden_count: 1,
            pick_type: 'auth',
            submitted_at: pick.created_at
          })
        }
        return acc
      }, [])
      
      setHiddenAuthPicks(formattedHiddenAuth)
      
      // Load picks with submitted = FALSE (if field exists)
      // Handle this gracefully since the field might not exist
      let unsubmittedAuthPicks: any[] = []
      try {
        const { data, error } = await supabase
          .from('picks')
          .select(`
            id,
            user_id,
            week,
            created_at,
            game_id,
            selected_team,
            users!picks_user_id_fkey (
              display_name,
              email
            ),
            games!picks_game_id_fkey (
              home_team,
              away_team
            )
          `)
          .eq('season', currentSeason)
          .eq('week', week)
          .eq('submitted', false)
        
        if (!error) {
          unsubmittedAuthPicks = data || []
        } else {
          console.log('⚠️ Submitted field may not exist in picks table:', error.message)
        }
      } catch (err) {
        console.log('⚠️ Error querying unsubmitted picks:', err)
      }
      
      // Anonymous picks with submitted = false (if field exists)
      let unsubmittedAnonPicks: any[] = []
      try {
        const { data, error } = await supabase
          .from('anonymous_picks')
          .select(`
            id,
            assigned_user_id,
            week,
            created_at,
            home_team,
            away_team,
            selected_team,
            name,
            email,
            users!anonymous_picks_assigned_user_id_fkey (
              display_name,
              email
            )
          `)
          .eq('season', currentSeason)
          .eq('week', week)
          .eq('submitted', false)
          .not('assigned_user_id', 'is', null)
        
        if (!error) {
          unsubmittedAnonPicks = data || []
        } else {
          console.log('⚠️ Submitted field may not exist in anonymous_picks table:', error.message)
        }
      } catch (err) {
        console.log('⚠️ Error querying unsubmitted anonymous picks:', err)
      }
      
      // Check for submitted anonymous picks to add notation
      let submittedAnonPicksByUser: { [userId: string]: boolean } = {}
      try {
        const { data: submittedAnonPicks } = await supabase
          .from('anonymous_picks')
          .select('assigned_user_id')
          .eq('season', currentSeason)
          .eq('week', week)
          .eq('submitted', true)
          .not('assigned_user_id', 'is', null)
        
        if (submittedAnonPicks) {
          submittedAnonPicks.forEach(pick => {
            if (pick.assigned_user_id) {
              submittedAnonPicksByUser[pick.assigned_user_id] = true
            }
          })
        }
      } catch (err) {
        console.log('⚠️ Error querying submitted anonymous picks:', err)
      }

      // Group unsubmitted picks by user
      const userPickSets: { [key: string]: UnsubmittedPickSet & { has_submitted_anonymous?: boolean } } = {}
      
      // Process auth picks
      unsubmittedAuthPicks.forEach(pick => {
        const key = `${pick.user_id}-auth`
        if (!userPickSets[key]) {
          userPickSets[key] = {
            user_id: pick.user_id,
            display_name: pick.users?.display_name || 'Unknown',
            email: pick.users?.email || '',
            week: pick.week,
            pick_type: 'auth',
            unsubmitted_count: 0,
            picks: [],
            has_submitted_anonymous: submittedAnonPicksByUser[pick.user_id] || false
          }
        }
        userPickSets[key].unsubmitted_count++
        userPickSets[key].picks.push({
          pick_id: pick.id,
          game_matchup: `${pick.games?.away_team || '?'} @ ${pick.games?.home_team || '?'}`,
          selected_team: pick.selected_team || '?',
          created_at: pick.created_at
        })
      })
      
      // Process anon picks
      unsubmittedAnonPicks.forEach(pick => {
        const key = `${pick.assigned_user_id}-anon`
        if (!userPickSets[key]) {
          userPickSets[key] = {
            user_id: pick.assigned_user_id,
            display_name: pick.users?.display_name || pick.name || 'Unknown',
            email: pick.users?.email || pick.email || '',
            week: pick.week,
            pick_type: 'anon',
            unsubmitted_count: 0,
            picks: []
          }
        }
        userPickSets[key].unsubmitted_count++
        userPickSets[key].picks.push({
          pick_id: pick.id,
          game_matchup: `${pick.away_team} @ ${pick.home_team}`,
          selected_team: pick.selected_team || '?',
          created_at: pick.created_at
        })
      })
      
      setUnsubmittedPickSets(Object.values(userPickSets))
      
      // Load users with multiple pick sets - those with more than 6 total picks
      // Get authenticated pick counts per user
      const { data: authPicks, error: authError } = await supabase
        .from('picks')
        .select(`
          user_id,
          show_on_leaderboard,
          submitted,
          users!picks_user_id_fkey (
            display_name
          )
        `)
        .eq('season', currentSeason)
        .eq('week', week)
      
      // Get anonymous pick counts per user
      const { data: anonPicks, error: anonError } = await supabase
        .from('anonymous_picks')
        .select(`
          assigned_user_id,
          show_on_leaderboard,
          submitted,
          users!anonymous_picks_assigned_user_id_fkey (
            display_name
          )
        `)
        .eq('season', currentSeason)
        .eq('week', week)
        .not('assigned_user_id', 'is', null)
      
      if (authError || anonError) {
        console.error('Error loading pick sets:', authError || anonError)
      } else {
        console.log('🔍 Raw pick data loaded:', {
          authPicks: authPicks?.length,
          anonPicks: anonPicks?.length,
          authPicksSample: authPicks?.slice(0, 3),
          anonPicksSample: anonPicks?.slice(0, 3)
        })
        // Count picks per user
        const userPickCounts: { [userId: string]: { 
          auth: number, 
          anon: number, 
          display_name: string,
          auth_visible: number,
          anon_visible: number,
          auth_submitted: boolean,
          anon_submitted: boolean
        }} = {}
        
        // Count authenticated picks
        if (Array.isArray(authPicks)) {
          authPicks.forEach(pick => {
            if (!userPickCounts[pick.user_id]) {
              userPickCounts[pick.user_id] = { 
                auth: 0, 
                anon: 0, 
                display_name: pick.users?.display_name || 'Unknown',
                auth_visible: 0,
                anon_visible: 0,
                auth_submitted: pick.submitted || false,
                anon_submitted: false
              }
            }
            userPickCounts[pick.user_id].auth++
            if (pick.show_on_leaderboard !== false) {
              userPickCounts[pick.user_id].auth_visible++
            }
            // Update submitted status - all picks in a set should have same submitted status
            userPickCounts[pick.user_id].auth_submitted = pick.submitted || false
          })
        }
        
        // Count anonymous picks
        if (Array.isArray(anonPicks)) {
          anonPicks.forEach(pick => {
            if (!userPickCounts[pick.assigned_user_id]) {
              userPickCounts[pick.assigned_user_id] = { 
                auth: 0, 
                anon: 0, 
                display_name: pick.users?.display_name || 'Unknown',
                auth_visible: 0,
                anon_visible: 0,
                auth_submitted: false,
                anon_submitted: pick.submitted || false
              }
            }
            userPickCounts[pick.assigned_user_id].anon++
            if (pick.show_on_leaderboard !== false) {
              userPickCounts[pick.assigned_user_id].anon_visible++
            }
            // Update submitted status - all picks in a set should have same submitted status
            userPickCounts[pick.assigned_user_id].anon_submitted = pick.submitted || false
          })
        }
        
        // Find users with more than 6 total picks AND both sets submitted (indicating multiple submitted sets)
        const multiple: MultiplePickSets[] = Object.entries(userPickCounts)
          .filter(([userId, counts]) => 
            (counts.auth + counts.anon) > 6 && 
            counts.auth > 0 && counts.anon > 0 &&
            counts.auth_submitted && counts.anon_submitted
          )
          .map(([userId, counts]) => {
            // Determine which type is selected based on visibility
            let selected_type = null
            if (counts.auth_visible > 0 && counts.anon_visible === 0) {
              selected_type = 'auth'
            } else if (counts.anon_visible > 0 && counts.auth_visible === 0) {
              selected_type = 'anon'
            } else if (counts.auth_visible > 0 && counts.anon_visible > 0) {
              selected_type = 'both' // Both are visible - conflict!
            }
            
            return {
              user_id: userId,
              display_name: counts.display_name,
              week: week,
              auth_picks: counts.auth,
              anon_picks: counts.anon,
              selected_type
            }
          })
        
        setMultiplePickSets(multiple)
        
        // Filter hidden anonymous picks to exclude users with multiple pick sets
        const multiplePickSetUserIds = new Set(multiple.map(user => user.user_id))
        const finalFilteredHiddenAnon = formattedHiddenAnon.filter(pick => 
          !multiplePickSetUserIds.has(pick.user_id)
        )
        setHiddenAnonPicks(finalFilteredHiddenAnon)
        
        // Debug logging - show all users with more than 6 picks
        const usersWithMoreThan6 = Object.entries(userPickCounts)
          .filter(([userId, counts]) => (counts.auth + counts.anon) > 6)
          .map(([userId, counts]) => ({
            userId: userId,
            display_name: counts.display_name,
            auth: counts.auth,
            anon: counts.anon,
            total: counts.auth + counts.anon,
            auth_submitted: counts.auth_submitted,
            anon_submitted: counts.anon_submitted,
            passes_filter: (counts.auth + counts.anon) > 6 && counts.auth > 0 && counts.anon > 0 && counts.auth_submitted && counts.anon_submitted
          }))
          
        console.log('🔍 Multiple pick sets debug:', {
          all_users_with_more_than_6_picks: usersWithMoreThan6,
          users_passing_all_filters: multiple,
          totalUsersWithDuplicates: multiple.length,
          hiddenAnonBeforeFilter: formattedHiddenAnon.length,
          hiddenAnonAfterFilter: finalFilteredHiddenAnon.length,
          filteredOutUsers: formattedHiddenAnon.filter(pick => multiplePickSetUserIds.has(pick.user_id)).map(p => p.display_name)
        })
        
        // Specific debug for Jason Murray
        const jasonId = '2473c706-a1f1-4254-86e9-2e7453c38c97'
        if (userPickCounts[jasonId]) {
          console.log('🔍 Jason Murray debug:', {
            user_id: jasonId,
            counts: userPickCounts[jasonId],
            total_picks: userPickCounts[jasonId].auth + userPickCounts[jasonId].anon,
            should_be_in_multiple: (userPickCounts[jasonId].auth + userPickCounts[jasonId].anon) > 6,
            filter_conditions: {
              has_more_than_6: (userPickCounts[jasonId].auth + userPickCounts[jasonId].anon) > 6,
              has_both_types: userPickCounts[jasonId].auth > 0 && userPickCounts[jasonId].anon > 0,
              both_submitted: userPickCounts[jasonId].auth_submitted && userPickCounts[jasonId].anon_submitted
            }
          })
        } else {
          console.log('🔍 Jason Murray NOT FOUND in userPickCounts for week', week)
        }
      }
      
      // Load submitted but unpaid picks (users who have submitted picks but payment status is not 'Paid')
      console.log('🔄 Loading submitted but unpaid picks...')
      
      // Get authenticated picks with submitted=true but payment status != 'Paid'
      const { data: unpaidAuthPicks, error: unpaidAuthError } = await supabase
        .from('picks')
        .select(`
          id,
          user_id,
          week,
          selected_team,
          result,
          points_earned,
          submitted_at,
          users!picks_user_id_fkey (
            display_name,
            email
          ),
          games!picks_game_id_fkey (
            home_team,
            away_team
          )
        `)
        .eq('season', currentSeason)
        .eq('week', week)
        .eq('submitted', true)
        .eq('show_on_leaderboard', true)
      
      // Get anonymous picks with submitted=true but payment status != 'Paid' 
      const { data: unpaidAnonPicks, error: unpaidAnonError } = await supabase
        .from('anonymous_picks')
        .select(`
          id,
          assigned_user_id,
          week,
          selected_team,
          points_earned,
          submitted_at,
          home_team,
          away_team,
          users!anonymous_picks_assigned_user_id_fkey (
            display_name,
            email
          )
        `)
        .eq('season', currentSeason)
        .eq('week', week)
        .eq('submitted', true)
        .eq('show_on_leaderboard', true)
        .not('assigned_user_id', 'is', null)
      
      if (unpaidAuthError || unpaidAnonError) {
        console.error('Error loading unpaid picks:', unpaidAuthError || unpaidAnonError)
      } else {
        // Get payment status for all users
        const allUserIds = new Set([
          ...(unpaidAuthPicks || []).map(p => p.user_id),
          ...(unpaidAnonPicks || []).map(p => p.assigned_user_id)
        ])
        
        const { data: paymentStatuses } = await supabase
          .from('leaguesafe_payments')
          .select('user_id, status')
          .eq('season', currentSeason)
          .in('user_id', Array.from(allUserIds))
        
        const paymentMap = new Map(
          (paymentStatuses || []).map(p => [p.user_id, p.status])
        )
        
        const unpaidUsers: { [key: string]: SubmittedUnpaidPickSet } = {}
        
        // Process authenticated picks
        ;(unpaidAuthPicks || []).forEach(pick => {
          const paymentStatus = paymentMap.get(pick.user_id) || 'NotPaid'
          
          // Only include if payment status is NOT 'Paid'
          if (paymentStatus !== 'Paid') {
            const key = `${pick.user_id}-auth`
            if (!unpaidUsers[key]) {
              unpaidUsers[key] = {
                user_id: pick.user_id,
                display_name: pick.users?.display_name || 'Unknown',
                email: pick.users?.email || '',
                week: pick.week,
                pick_type: 'auth',
                submitted_count: 0,
                total_points: 0,
                payment_status: paymentStatus,
                picks: []
              }
            }
            unpaidUsers[key].submitted_count++
            unpaidUsers[key].total_points += pick.points_earned || 0
            unpaidUsers[key].picks.push({
              pick_id: pick.id,
              game_matchup: `${pick.games?.away_team || '?'} @ ${pick.games?.home_team || '?'}`,
              selected_team: pick.selected_team,
              result: pick.result,
              points_earned: pick.points_earned || 0,
              submitted_at: pick.submitted_at
            })
          }
        })
        
        // Process anonymous picks
        ;(unpaidAnonPicks || []).forEach(pick => {
          const paymentStatus = paymentMap.get(pick.assigned_user_id) || 'NotPaid'
          
          // Only include if payment status is NOT 'Paid'
          if (paymentStatus !== 'Paid') {
            const key = `${pick.assigned_user_id}-anon`
            if (!unpaidUsers[key]) {
              unpaidUsers[key] = {
                user_id: pick.assigned_user_id,
                display_name: pick.users?.display_name || 'Unknown',
                email: pick.users?.email || '',
                week: pick.week,
                pick_type: 'anon',
                submitted_count: 0,
                total_points: 0,
                payment_status: paymentStatus,
                picks: []
              }
            }
            unpaidUsers[key].submitted_count++
            unpaidUsers[key].total_points += pick.points_earned || 0
            unpaidUsers[key].picks.push({
              pick_id: pick.id,
              game_matchup: `${pick.away_team} @ ${pick.home_team}`,
              selected_team: pick.selected_team,
              points_earned: pick.points_earned || 0,
              submitted_at: pick.submitted_at
            })
          }
        })
        
        setSubmittedUnpaidPickSets(Object.values(unpaidUsers))
        console.log('✅ Loaded', Object.values(unpaidUsers).length, 'submitted but unpaid pick sets')
      }
      
      setMessage(`Loaded data for Week ${week}`)
    } catch (error: any) {
      console.error('Error loading data:', error)
      const errorMessage = error?.message || String(error) || 'Unknown error occurred'
      setMessage(`Error: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }
  
  // Toggle section collapse
  const toggleSection = (section: keyof typeof sectionsCollapsed) => {
    setSectionsCollapsed(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }
  
  // Check if a user has multiple pick sets
  const hasMultiplePickSets = (userId: string) => {
    return multiplePickSets.some(user => user.user_id === userId)
  }
  
  // Toggle visibility for picks
  const toggleVisibility = async (userId: string, pickType: 'auth' | 'anon', visible: boolean) => {
    try {
      const functionName = pickType === 'auth' 
        ? 'toggle_picks_leaderboard_visibility'
        : 'toggle_anonymous_picks_leaderboard_visibility'
      
      const { data, error } = await supabase.rpc(functionName, {
        target_user_id: userId,
        target_season: currentSeason,
        target_week: parseInt(selectedWeek),
        show_on_leaderboard: visible
      })
      
      if (error) throw error
      
      setMessage(`Successfully ${visible ? 'showed' : 'hid'} picks on leaderboard`)
      await loadAllData() // Refresh data
    } catch (error: any) {
      console.error('Error toggling visibility:', error)
      const errorMessage = error?.message || String(error) || 'Unknown error occurred'
      setMessage(`Error: ${errorMessage}`)
    }
  }
  
  // Start editing a processing note
  const startEditingNote = (id: string, currentNote: string) => {
    setEditingNote(id)
    setTempNote(currentNote || '')
  }
  
  // Cancel editing
  const cancelEditingNote = () => {
    setEditingNote(null)
    setTempNote('')
  }
  
  // Save processing note for unassigned picks
  const saveUnassignedNote = async (pickSetId: string) => {
    setSavingNote(true)
    try {
      const pickSet = unassignedAnon.find(p => p.id === pickSetId)
      if (!pickSet) throw new Error('Pick set not found')
      
      // Update all picks in this set with the new note
      const { error } = await supabase
        .from('anonymous_picks')
        .update({ processing_notes: tempNote })
        .eq('email', pickSet.user_email)
        .eq('week', parseInt(selectedWeek))
        .eq('season', currentSeason)
        .is('assigned_user_id', null)
      
      if (error) throw error
      
      setMessage('Processing note saved successfully')
      setEditingNote(null)
      setTempNote('')
      await loadAllData() // Refresh data
    } catch (error: any) {
      console.error('Error saving note:', error)
      const errorMessage = error?.message || String(error) || 'Unknown error occurred'
      setMessage(`Error saving note: ${errorMessage}`)
    } finally {
      setSavingNote(false)
    }
  }
  
  // Open manage pick sets modal
  const openManagePickSets = async (user: MultiplePickSets) => {
    setManagingPickSets(user)
    setPickSetDetails({})
    setUpdatingPickSets(true)
    
    try {
      // Load authenticated picks
      const { data: authPicks, error: authError } = await supabase
        .from('picks')
        .select('*')
        .eq('user_id', user.user_id)
        .eq('week', parseInt(selectedWeek))
        .eq('season', currentSeason)
      
      if (authError) throw authError
      
      // Load anonymous picks
      const { data: anonPicks, error: anonError } = await supabase
        .from('anonymous_picks')
        .select('*')
        .eq('assigned_user_id', user.user_id)
        .eq('week', parseInt(selectedWeek))
        .eq('season', currentSeason)
      
      if (anonError) throw anonError
      
      const details: { auth?: PickSetDetails, anon?: PickSetDetails } = {}
      
      if (authPicks && authPicks.length > 0) {
        const individualVisibility: { [pickId: string]: boolean } = {}
        authPicks.forEach(pick => {
          individualVisibility[pick.id] = pick.show_on_leaderboard !== false
        })
        
        details.auth = {
          type: 'auth',
          picks: authPicks,
          show_on_leaderboard: authPicks.every(p => p.show_on_leaderboard !== false),
          submitted: authPicks[0].submitted || false,
          submitted_at: authPicks[0].submitted_at,
          individualPickVisibility: individualVisibility
        }
      }
      
      if (anonPicks && anonPicks.length > 0) {
        const individualVisibility: { [pickId: string]: boolean } = {}
        anonPicks.forEach(pick => {
          individualVisibility[pick.id] = pick.show_on_leaderboard !== false
        })
        
        details.anon = {
          type: 'anon',
          picks: anonPicks,
          show_on_leaderboard: anonPicks.every(p => p.show_on_leaderboard !== false),
          submitted: anonPicks[0].submitted || false,
          submitted_at: anonPicks[0].submitted_at,
          individualPickVisibility: individualVisibility
        }
      }
      
      setPickSetDetails(details)
    } catch (error: any) {
      console.error('Error loading pick set details:', error)
      const errorMessage = error?.message || String(error) || 'Unknown error occurred'
      setMessage(`Error loading pick sets: ${errorMessage}`)
    } finally {
      setUpdatingPickSets(false)
    }
  }
  
  // Toggle entire pick set visibility
  const togglePickSetVisibility = async (type: 'auth' | 'anon', visible: boolean) => {
    if (!managingPickSets) return
    
    console.log('🔧 togglePickSetVisibility called:', { type, visible, pickSetDetails })
    
    setUpdatingPickSets(true)
    try {
      if (type === 'auth' && pickSetDetails.auth) {
        const { error } = await supabase
          .from('picks')
          .update({ show_on_leaderboard: visible })
          .eq('user_id', managingPickSets.user_id)
          .eq('week', parseInt(selectedWeek))
          .eq('season', currentSeason)
        
        if (error) throw error
        
        // Update local state
        const updatedAuth = { ...pickSetDetails.auth }
        updatedAuth.show_on_leaderboard = visible
        // Initialize individualPickVisibility if it doesn't exist
        if (!updatedAuth.individualPickVisibility) {
          updatedAuth.individualPickVisibility = {}
        }
        if (updatedAuth.picks && Array.isArray(updatedAuth.picks)) {
          updatedAuth.picks.forEach(pick => {
            if (pick && pick.id) {
              updatedAuth.individualPickVisibility![pick.id] = visible
            }
          })
        }
        setPickSetDetails({ ...pickSetDetails, auth: updatedAuth })
      } else if (type === 'anon' && pickSetDetails.anon) {
        const { error } = await supabase
          .from('anonymous_picks')
          .update({ 
            show_on_leaderboard: visible,
            is_active_pick_set: visible
          })
          .eq('assigned_user_id', managingPickSets.user_id)
          .eq('week', parseInt(selectedWeek))
          .eq('season', currentSeason)
        
        if (error) throw error
        
        // Update local state
        const updatedAnon = { ...pickSetDetails.anon }
        updatedAnon.show_on_leaderboard = visible
        // Initialize individualPickVisibility if it doesn't exist
        if (!updatedAnon.individualPickVisibility) {
          updatedAnon.individualPickVisibility = {}
        }
        if (updatedAnon.picks && Array.isArray(updatedAnon.picks)) {
          updatedAnon.picks.forEach(pick => {
            if (pick && pick.id) {
              updatedAnon.individualPickVisibility![pick.id] = visible
            }
          })
        }
        setPickSetDetails({ ...pickSetDetails, anon: updatedAnon })
      }
      
      setMessage(`Successfully ${visible ? 'enabled' : 'disabled'} ${type === 'auth' ? 'authenticated' : 'anonymous'} picks`)
    } catch (error: any) {
      console.error('Error updating pick set visibility:', error)
      const errorMessage = error?.message || String(error) || 'Unknown error occurred'
      setMessage(`Error updating visibility: ${errorMessage}`)
    } finally {
      setUpdatingPickSets(false)
    }
  }
  
  // Toggle individual pick visibility
  const toggleIndividualPick = async (type: 'auth' | 'anon', pickId: string, visible: boolean) => {
    if (!managingPickSets) return
    
    setUpdatingPickSets(true)
    try {
      if (type === 'auth') {
        const { error } = await supabase
          .from('picks')
          .update({ show_on_leaderboard: visible })
          .eq('id', pickId)
        
        if (error) throw error
        
        // Update local state
        if (pickSetDetails.auth?.individualPickVisibility) {
          const updated = { ...pickSetDetails.auth }
          updated.individualPickVisibility[pickId] = visible
          // Update overall status based on individual picks
          updated.show_on_leaderboard = Object.values(updated.individualPickVisibility).every(v => v)
          setPickSetDetails({ ...pickSetDetails, auth: updated })
        }
      } else {
        const { error } = await supabase
          .from('anonymous_picks')
          .update({ show_on_leaderboard: visible })
          .eq('id', pickId)
        
        if (error) throw error
        
        // Update local state
        if (pickSetDetails.anon?.individualPickVisibility) {
          const updated = { ...pickSetDetails.anon }
          updated.individualPickVisibility[pickId] = visible
          // Update overall status based on individual picks
          updated.show_on_leaderboard = Object.values(updated.individualPickVisibility).every(v => v)
          setPickSetDetails({ ...pickSetDetails, anon: updated })
        }
      }
      
      setMessage(`Successfully updated individual pick visibility`)
    } catch (error: any) {
      console.error('Error updating individual pick:', error)
      const errorMessage = error?.message || String(error) || 'Unknown error occurred'
      setMessage(`Error updating pick: ${errorMessage}`)
    } finally {
      setUpdatingPickSets(false)
    }
  }
  
  // Update which pick set is active (legacy function, kept for compatibility)
  const updateActivePickSet = async (activeType: 'auth' | 'anon') => {
    if (!managingPickSets) return
    
    // Make one set active and the other inactive
    if (activeType === 'auth') {
      await togglePickSetVisibility('auth', true)
      await togglePickSetVisibility('anon', false)
    } else {
      await togglePickSetVisibility('anon', true)
      await togglePickSetVisibility('auth', false)
    }
    
    await loadAllData() // Refresh the data
  }
  
  // Save processing note for hidden picks
  const saveHiddenNote = async (pickData: HiddenPicks) => {
    setSavingNote(true)
    try {
      if (pickData.pick_type === 'anon' && pickData.pick_ids) {
        // Update anonymous picks
        const { error } = await supabase
          .from('anonymous_picks')
          .update({ processing_notes: tempNote })
          .in('id', pickData.pick_ids)
        
        if (error) throw error
      }
      // For auth picks, we'd need to add processing_notes to the picks table
      // or handle it differently since auth picks might not have this field
      
      setMessage('Processing note saved successfully')
      setEditingNote(null)
      setTempNote('')
      await loadAllData() // Refresh data
    } catch (error: any) {
      console.error('Error saving note:', error)
      const errorMessage = error?.message || String(error) || 'Unknown error occurred'
      setMessage(`Error saving note: ${errorMessage}`)
    } finally {
      setSavingNote(false)
    }
  }
  
  useEffect(() => {
    loadAllData()
  }, [selectedWeek, currentSeason])
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-pigskin-900">Pick Management</h2>
          <p className="text-gray-600">Centralized management for all pick-related issues</p>
        </div>
        
        <div className="flex items-center gap-4">
          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...Array(18)].map((_, i) => (
                <SelectItem key={i + 1} value={(i + 1).toString()}>
                  Week {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button onClick={loadAllData} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>
      
      {message && message !== '{}' && (
        <Alert>
          <AlertDescription>{typeof message === 'string' ? message : JSON.stringify(message)}</AlertDescription>
        </Alert>
      )}
      
      {/* Unassigned Anonymous Picks */}
      <Card>
        <CardHeader 
          className="cursor-pointer"
          onClick={() => toggleSection('unassigned')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Unassigned Anonymous Pick Sets</CardTitle>
              <Badge variant="outline">{unassignedAnon.length}</Badge>
            </div>
            {sectionsCollapsed.unassigned ? <ChevronDown /> : <ChevronUp />}
          </div>
          <CardDescription>
            Anonymous picks that haven't been assigned to any user
          </CardDescription>
        </CardHeader>
        
        {!sectionsCollapsed.unassigned && (
          <CardContent>
            {unassignedAnon.length === 0 ? (
              <p className="text-gray-500">No unassigned anonymous picks</p>
            ) : (
              <div className="space-y-3">
                {unassignedAnon.map(pickSet => (
                  <div key={pickSet.id} className="border rounded-lg">
                    <div className="flex items-center justify-between p-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{pickSet.user_name || 'Unknown User'}</p>
                          {pickSet.user_email && (
                            <Badge variant="secondary" className="text-xs">
                              {pickSet.user_email}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm text-gray-600">
                            {pickSet.picks.length} picks submitted
                          </p>
                          {pickSet.picks.filter(p => p.is_lock).length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {pickSet.picks.filter(p => p.is_lock).length} lock
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          Submitted: {new Date(pickSet.created_at).toLocaleString()}
                        </p>
                        <Badge variant="outline" className="mt-1">
                          {pickSet.validation_status || 'pending'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => startEditingNote(`unassigned-${pickSet.id}`, pickSet.processing_notes || '')}
                        >
                          <MessageSquare className="w-3 h-3 mr-1" />
                          {pickSet.processing_notes ? 'Edit Note' : 'Add Note'}
                        </Button>
                        <Button size="sm" variant="outline">
                          Assign User
                        </Button>
                      </div>
                    </div>
                    
                    {/* Processing Note Display */}
                    {pickSet.processing_notes && editingNote !== `unassigned-${pickSet.id}` && (
                      <div className="px-3 pb-2">
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                          <p className="text-sm font-medium text-yellow-800">Processing Note:</p>
                          <p className="text-sm text-yellow-700 mt-1">{pickSet.processing_notes}</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Note Editing UI */}
                    {editingNote === `unassigned-${pickSet.id}` && (
                      <div className="px-3 pb-3 border-t">
                        <div className="pt-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Processing Note
                          </label>
                          <Textarea
                            value={tempNote}
                            onChange={(e) => setTempNote(e.target.value)}
                            placeholder="Add a note about why this pick set is not included..."
                            className="w-full mb-2"
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveUnassignedNote(pickSet.id)}
                              disabled={savingNote}
                            >
                              <Save className="w-3 h-3 mr-1" />
                              {savingNote ? 'Saving...' : 'Save'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEditingNote}
                              disabled={savingNote}
                            >
                              <X className="w-3 h-3 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
      
      {/* Hidden Anonymous Picks */}
      <Card>
        <CardHeader 
          className="cursor-pointer"
          onClick={() => toggleSection('hiddenAnon')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Hidden Anonymous Picks</CardTitle>
              <Badge variant="outline" className="bg-red-50">{hiddenAnonPicks.length}</Badge>
            </div>
            {sectionsCollapsed.hiddenAnon ? <ChevronDown /> : <ChevronUp />}
          </div>
          <CardDescription>
            Anonymous picks marked as hidden from leaderboard (show_on_leaderboard = false)
          </CardDescription>
        </CardHeader>
        
        {!sectionsCollapsed.hiddenAnon && (
          <CardContent>
            {hiddenAnonPicks.length === 0 ? (
              <p className="text-gray-500">No hidden anonymous picks</p>
            ) : (
              <div className="space-y-3">
                {hiddenAnonPicks.map(pick => (
                  <div key={`${pick.user_id}-${pick.week}`} className="border rounded-lg">
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{pick.display_name}</p>
                            {pick.user_email && (
                              <Badge variant="secondary" className="text-xs">
                                Submission: {pick.user_email}
                              </Badge>
                            )}
                            {pick.profile_email && pick.profile_email !== pick.user_email && (
                              <Badge variant="outline" className="text-xs">
                                Profile: {pick.profile_email}
                              </Badge>
                            )}
                            {pick.leaguesafe_email && pick.leaguesafe_email !== pick.profile_email && pick.leaguesafe_email !== pick.user_email && (
                              <Badge variant="default" className="text-xs bg-blue-100 text-blue-800">
                                LeagueSafe: {pick.leaguesafe_email}
                              </Badge>
                            )}
                            {/* Debug info - remove after fixing */}
                            {pick.display_name?.toLowerCase().includes('tyler') && (
                              <Badge variant="destructive" className="text-xs">
                                DEBUG: LS={pick.leaguesafe_email || 'NONE'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">
                            {pick.hidden_count} of {pick.pick_count} picks hidden
                          </p>
                          {pick.assigned_user_id && (
                            <p className="text-xs text-gray-500">
                              User ID: {pick.assigned_user_id}
                            </p>
                          )}
                          {pick.submitted_at && (
                            <p className="text-xs text-gray-500 mt-1">
                              Submitted: {new Date(pick.submitted_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive">
                            <EyeOff className="w-3 h-3 mr-1" />
                            Hidden
                          </Badge>
                          {hasMultiplePickSets(pick.user_id) && (
                            <Badge variant="outline" className="text-xs bg-orange-100 text-orange-800">
                              <Copy className="w-3 h-3 mr-1" />
                              Multiple Sets
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => startEditingNote(`hidden-anon-${pick.user_id}-${pick.week}`, pick.processing_notes || '')}
                        >
                          <MessageSquare className="w-3 h-3 mr-1" />
                          {pick.processing_notes ? 'Edit Note' : 'Add Note'}
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => toggleVisibility(pick.user_id, 'anon', true)}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          Show on Leaderboard
                        </Button>
                      </div>
                    </div>
                    
                    {/* Processing Note Display */}
                    {pick.processing_notes && editingNote !== `hidden-anon-${pick.user_id}-${pick.week}` && (
                      <div className="px-3 pb-2">
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                          <p className="text-sm font-medium text-yellow-800">Processing Note:</p>
                          <p className="text-sm text-yellow-700 mt-1">{pick.processing_notes}</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Note Editing UI */}
                    {editingNote === `hidden-anon-${pick.user_id}-${pick.week}` && (
                      <div className="px-3 pb-3 border-t">
                        <div className="pt-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Processing Note
                          </label>
                          <Textarea
                            value={tempNote}
                            onChange={(e) => setTempNote(e.target.value)}
                            placeholder="Add a note about why these picks are hidden..."
                            className="w-full mb-2"
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveHiddenNote(pick)}
                              disabled={savingNote}
                            >
                              <Save className="w-3 h-3 mr-1" />
                              {savingNote ? 'Saving...' : 'Save'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEditingNote}
                              disabled={savingNote}
                            >
                              <X className="w-3 h-3 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
      
      {/* Hidden Authenticated Picks */}
      <Card>
        <CardHeader 
          className="cursor-pointer"
          onClick={() => toggleSection('hiddenAuth')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Hidden Authenticated Picks</CardTitle>
              <Badge variant="outline" className="bg-red-50">{hiddenAuthPicks.length}</Badge>
            </div>
            {sectionsCollapsed.hiddenAuth ? <ChevronDown /> : <ChevronUp />}
          </div>
          <CardDescription>
            Authenticated picks marked as hidden from leaderboard (show_on_leaderboard = false)
          </CardDescription>
        </CardHeader>
        
        {!sectionsCollapsed.hiddenAuth && (
          <CardContent>
            {hiddenAuthPicks.length === 0 ? (
              <p className="text-gray-500">No hidden authenticated picks</p>
            ) : (
              <div className="space-y-2">
                {hiddenAuthPicks.map(pick => (
                  <div key={`${pick.user_id}-${pick.week}`} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium">{pick.display_name}</p>
                        <p className="text-sm text-gray-600">
                          {pick.hidden_count} of {pick.pick_count} picks hidden
                        </p>
                        {pick.submitted_at && (
                          <p className="text-xs text-gray-500 mt-1">
                            Submitted: {new Date(pick.submitted_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <Badge variant="destructive">
                        <EyeOff className="w-3 h-3 mr-1" />
                        Hidden
                      </Badge>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => toggleVisibility(pick.user_id, 'auth', true)}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Show on Leaderboard
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
      
      {/* Unsubmitted Users */}
      <Card>
        <CardHeader 
          className="cursor-pointer"
          onClick={() => toggleSection('unsubmitted')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Unsubmitted Picks</CardTitle>
              <Badge variant="outline" className="bg-yellow-50">{unsubmittedPickSets.length}</Badge>
            </div>
            {sectionsCollapsed.unsubmitted ? <ChevronDown /> : <ChevronUp />}
          </div>
          <CardDescription>
            Picks with submitted = FALSE status for Week {selectedWeek}
          </CardDescription>
        </CardHeader>
        
        {!sectionsCollapsed.unsubmitted && (
          <CardContent>
            {unsubmittedPickSets.length === 0 ? (
              <p className="text-gray-500">No pick sets with submitted = FALSE status</p>
            ) : (
              <div className="space-y-3">
                {unsubmittedPickSets.map(pickSet => (
                  <div key={`${pickSet.user_id}-${pickSet.pick_type}`} className="border rounded-lg">
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{pickSet.display_name}</p>
                            <Badge variant="outline" className="text-xs">
                              {pickSet.pick_type.toUpperCase()}
                            </Badge>
                            {pickSet.has_submitted_anonymous && (
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-300">
                                Has Anonymous Submitted
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">
                            {pickSet.unsubmitted_count} unsubmitted picks
                          </p>
                          <p className="text-xs text-gray-500">{pickSet.email}</p>
                          {pickSet.has_submitted_anonymous && (
                            <p className="text-xs text-blue-600 mt-1">
                              ℹ️ This user also has submitted anonymous picks for this week
                            </p>
                          )}
                        </div>
                        <Badge variant="secondary">
                          <UserX className="w-3 h-3 mr-1" />
                          Not Submitted
                        </Badge>
                      </div>
                    </div>
                    
                    {/* Individual picks list */}
                    <div className="px-3 pb-3 border-t bg-gray-50">
                      <div className="pt-2">
                        <p className="text-sm font-medium text-gray-700 mb-2">Unsubmitted Picks:</p>
                        <div className="space-y-1">
                          {pickSet.picks.map(pick => (
                            <div key={pick.pick_id} className="flex items-center justify-between text-xs">
                              <div>
                                <span className="font-medium">{pick.selected_team}</span>
                                <span className="text-gray-500 ml-2">vs {pick.game_matchup}</span>
                              </div>
                              <span className="text-gray-400">
                                {new Date(pick.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
      
      {/* Submitted but Unpaid Users */}
      <Card>
        <CardHeader 
          className="cursor-pointer"
          onClick={() => toggleSection('submittedUnpaid')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Submitted but Unpaid</CardTitle>
              <Badge variant="outline" className="bg-orange-50">{submittedUnpaidPickSets.length}</Badge>
            </div>
            {sectionsCollapsed.submittedUnpaid ? <ChevronDown /> : <ChevronUp />}
          </div>
          <CardDescription>
            Users who have submitted picks but payment status is not 'Paid' - these users don't appear on leaderboards
          </CardDescription>
        </CardHeader>
        
        {!sectionsCollapsed.submittedUnpaid && (
          <CardContent>
            {submittedUnpaidPickSets.length === 0 ? (
              <p className="text-gray-500">All submitted users have paid status</p>
            ) : (
              <div className="space-y-3">
                {submittedUnpaidPickSets.map(pickSet => (
                  <div key={`${pickSet.user_id}-${pickSet.pick_type}`} className="border rounded-lg">
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{pickSet.display_name}</p>
                            <Badge variant="outline" className="text-xs">
                              {pickSet.pick_type.toUpperCase()}
                            </Badge>
                            <Badge 
                              variant={pickSet.payment_status === 'Pending' ? 'secondary' : 'destructive'}
                              className="text-xs"
                            >
                              {pickSet.payment_status || 'NotPaid'}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600">
                            {pickSet.submitted_count} submitted picks • {pickSet.total_points} points earned
                          </p>
                          <p className="text-xs text-gray-500">{pickSet.email}</p>
                          <p className="text-xs text-orange-600 mt-1">
                            ⚠️ Won't appear on leaderboards until payment status is 'Paid'
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            <UserX className="w-3 h-3 mr-1" />
                            Hidden from Leaderboard
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            // Navigate to user management to update payment status
                            console.log('Navigate to user management for', pickSet.user_id)
                          }}
                        >
                          Update Payment
                        </Button>
                      </div>
                    </div>
                    
                    {/* Individual picks list */}
                    <div className="px-3 pb-3 border-t bg-gray-50">
                      <div className="pt-2">
                        <p className="text-sm font-medium text-gray-700 mb-2">Submitted Picks:</p>
                        <div className="space-y-1">
                          {pickSet.picks.map(pick => (
                            <div key={pick.pick_id} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{pick.selected_team}</span>
                                <span className="text-gray-500">vs {pick.game_matchup}</span>
                                {pick.result && (
                                  <Badge 
                                    variant={pick.result === 'win' ? 'default' : 
                                            pick.result === 'loss' ? 'destructive' : 'secondary'}
                                    className="text-xs"
                                  >
                                    {pick.result}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600">{pick.points_earned} pts</span>
                                <span className="text-gray-400">
                                  {new Date(pick.submitted_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
      
      {/* Multiple Pick Sets */}
      <Card>
        <CardHeader 
          className="cursor-pointer"
          onClick={() => toggleSection('multiple')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Multiple Pick Sets</CardTitle>
              <Badge variant="outline" className="bg-orange-50">{multiplePickSets.length}</Badge>
            </div>
            {sectionsCollapsed.multiple ? <ChevronDown /> : <ChevronUp />}
          </div>
          <CardDescription>
            Users with both anonymous and authenticated picks for the same week
          </CardDescription>
        </CardHeader>
        
        {!sectionsCollapsed.multiple && (
          <CardContent>
            {multiplePickSets.length === 0 ? (
              <p className="text-gray-500">No users with multiple pick sets</p>
            ) : (
              <div className="space-y-2">
                {multiplePickSets.map(user => (
                  <div key={`${user.user_id}-${user.week}`} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium">{user.display_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {user.auth_picks > 0 && (
                            <Badge variant={user.selected_type === 'auth' ? 'default' : 'outline'} 
                                   className={user.selected_type === 'auth' ? 'bg-green-500 text-white' : ''}>
                              {user.auth_picks} Auth {user.selected_type === 'auth' && '✓'}
                            </Badge>
                          )}
                          {user.anon_picks > 0 && (
                            <Badge variant={user.selected_type === 'anon' ? 'default' : 'outline'}
                                   className={user.selected_type === 'anon' ? 'bg-green-500 text-white' : ''}>
                              {user.anon_picks} Anon {user.selected_type === 'anon' && '✓'}
                            </Badge>
                          )}
                          {user.selected_type === 'both' && (
                            <Badge variant="destructive">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Both Active!
                            </Badge>
                          )}
                          {!user.selected_type && (
                            <Badge variant="secondary">
                              <EyeOff className="w-3 h-3 mr-1" />
                              None Active
                            </Badge>
                          )}
                        </div>
                      </div>
                      {user.selected_type === 'both' ? (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                      )}
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => openManagePickSets(user)}
                    >
                      Manage Sets
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
      
      {/* Modal for managing multiple pick sets */}
      {managingPickSets && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <Card className="max-w-3xl w-full max-h-[90vh] overflow-auto">
            <CardHeader>
              <CardTitle>Manage Pick Sets - {managingPickSets.display_name}</CardTitle>
              <CardDescription>
                Control which picks are active for Week {selectedWeek}. You can toggle entire sets or individual picks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {updatingPickSets && pickSetDetails.auth === undefined && pickSetDetails.anon === undefined ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 border-4 border-pigskin-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p>Loading pick sets...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Quick Actions */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium mb-2 text-sm">Quick Actions:</h4>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => updateActivePickSet('auth')}
                        disabled={!pickSetDetails.auth || updatingPickSets}
                      >
                        Use Authenticated Only
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => updateActivePickSet('anon')}
                        disabled={!pickSetDetails.anon || updatingPickSets}
                      >
                        Use Anonymous Only
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            if (pickSetDetails.auth) await togglePickSetVisibility('auth', false)
                            if (pickSetDetails.anon) await togglePickSetVisibility('anon', false)
                          } catch (err) {
                            console.error('Error hiding all picks:', err)
                          }
                        }}
                        disabled={updatingPickSets}
                      >
                        Hide All Picks
                      </Button>
                    </div>
                  </div>
                  
                  {/* Authenticated Picks */}
                  {pickSetDetails.auth && (
                    <div className={`border rounded-lg ${pickSetDetails.auth.show_on_leaderboard ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                              Authenticated Picks
                              {pickSetDetails.auth.show_on_leaderboard ? (
                                <Badge className="bg-green-500 text-white">Active</Badge>
                              ) : (
                                <Badge variant="outline" className="text-gray-600">Inactive</Badge>
                              )}
                            </h3>
                            <p className="text-sm text-gray-600 mt-1">
                              {pickSetDetails.auth.picks.length} picks
                              {pickSetDetails.auth.submitted && ' (Submitted)'}
                            </p>
                            {pickSetDetails.auth.submitted_at && (
                              <p className="text-xs text-gray-500">
                                Submitted: {new Date(pickSetDetails.auth.submitted_at).toLocaleString()}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Label htmlFor="auth-toggle" className="text-sm">
                              Show on Leaderboard
                            </Label>
                            <Switch
                              id="auth-toggle"
                              checked={pickSetDetails.auth.show_on_leaderboard}
                              onCheckedChange={(checked) => togglePickSetVisibility('auth', checked)}
                              disabled={updatingPickSets}
                            />
                          </div>
                        </div>
                        
                        <div className="flex gap-2 mb-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => togglePickSetVisibility('auth', true)}
                            disabled={pickSetDetails.auth.show_on_leaderboard || updatingPickSets}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            Enable All
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => togglePickSetVisibility('auth', false)}
                            disabled={!pickSetDetails.auth.show_on_leaderboard || updatingPickSets}
                          >
                            <EyeOff className="w-3 h-3 mr-1" />
                            Disable All
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => updateActivePickSet('auth')}
                            disabled={updatingPickSets}
                          >
                            <Check className="w-3 h-3 mr-1" />
                            Set as Only Active
                          </Button>
                        </div>
                        
                        {/* Individual picks */}
                        <div className="border-t pt-3">
                          <p className="text-sm font-medium mb-3">Individual Picks:</p>
                          <div className="space-y-2">
                            {pickSetDetails.auth.picks && Array.isArray(pickSetDetails.auth.picks) && pickSetDetails.auth.picks.map((pick: any) => (
                              <div key={pick.id} className="flex items-center justify-between p-2 bg-white rounded border">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{pick.selected_team}</span>
                                  {pick.is_lock && (
                                    <Badge variant="outline" className="text-xs">LOCK</Badge>
                                  )}
                                </div>
                                <Switch
                                  checked={pickSetDetails.auth.individualPickVisibility?.[pick.id] ?? true}
                                  onCheckedChange={(checked) => toggleIndividualPick('auth', pick.id, checked)}
                                  disabled={updatingPickSets}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Anonymous Picks */}
                  {pickSetDetails.anon && (
                    <div className={`border rounded-lg ${pickSetDetails.anon.show_on_leaderboard ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                              Anonymous Picks
                              {pickSetDetails.anon.show_on_leaderboard ? (
                                <Badge className="bg-green-500 text-white">Active</Badge>
                              ) : (
                                <Badge variant="outline" className="text-gray-600">Inactive</Badge>
                              )}
                            </h3>
                            <p className="text-sm text-gray-600 mt-1">
                              {pickSetDetails.anon.picks.length} picks
                              {pickSetDetails.anon.submitted && ' (Submitted)'}
                            </p>
                            {pickSetDetails.anon.submitted_at && (
                              <p className="text-xs text-gray-500">
                                Submitted: {new Date(pickSetDetails.anon.submitted_at).toLocaleString()}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Label htmlFor="anon-toggle" className="text-sm">
                              Show on Leaderboard
                            </Label>
                            <Switch
                              id="anon-toggle"
                              checked={pickSetDetails.anon.show_on_leaderboard}
                              onCheckedChange={(checked) => togglePickSetVisibility('anon', checked)}
                              disabled={updatingPickSets}
                            />
                          </div>
                        </div>
                        
                        <div className="flex gap-2 mb-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => togglePickSetVisibility('anon', true)}
                            disabled={pickSetDetails.anon.show_on_leaderboard || updatingPickSets}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            Enable All
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => togglePickSetVisibility('anon', false)}
                            disabled={!pickSetDetails.anon.show_on_leaderboard || updatingPickSets}
                          >
                            <EyeOff className="w-3 h-3 mr-1" />
                            Disable All
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => updateActivePickSet('anon')}
                            disabled={updatingPickSets}
                          >
                            <Check className="w-3 h-3 mr-1" />
                            Set as Only Active
                          </Button>
                        </div>
                        
                        {/* Individual picks */}
                        <div className="border-t pt-3">
                          <p className="text-sm font-medium mb-3">Individual Picks:</p>
                          <div className="space-y-2">
                            {pickSetDetails.anon.picks && Array.isArray(pickSetDetails.anon.picks) && pickSetDetails.anon.picks.map((pick: any) => (
                              <div key={pick.id} className="flex items-center justify-between p-2 bg-white rounded border">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{pick.selected_team}</span>
                                  {pick.is_lock && (
                                    <Badge variant="outline" className="text-xs">LOCK</Badge>
                                  )}
                                </div>
                                <Switch
                                  checked={pickSetDetails.anon.individualPickVisibility?.[pick.id] ?? true}
                                  onCheckedChange={(checked) => toggleIndividualPick('anon', pick.id, checked)}
                                  disabled={updatingPickSets}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Action buttons */}
                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setManagingPickSets(null)
                        setPickSetDetails({})
                      }}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}