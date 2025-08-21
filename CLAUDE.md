# Pigskin Pick Six Pro - Claude Context

## Project Overview

Pigskin Pick Six Pro is a modern, mobile-first college football pick 'em contest platform. Players select 6 games against the spread each week, with one "Lock" pick for double points. The platform features live scoring, season-long leaderboards, and comprehensive admin tools.

**Key Features:**
- Smart pick system (6 games ATS + 1 Lock pick)
- Live scoring with 20/10/0 point system
- Season-long + "Best Finish" (weeks 11-14) championships
- Admin tools for game selection and league management
- LeagueSafe integration for payment tracking
- AI-powered weekly insights

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS with custom Pigskin Pick Six branding
- **UI Components**: shadcn/ui with sports theming
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **External APIs**: CollegeFootballData.com (free tier)
- **Deployment**: Vercel-ready
- **Local Development**: Supabase CLI with local database

## Development Commands

```bash
# Start development server (http://localhost:5173)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Run ESLint
npm run lint

# Local Supabase development (if configured)
npx supabase start
npx supabase stop
npx supabase status
```

## Environment Setup

### Required Environment Variables
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_CFBD_API_KEY=your_cfbd_api_key_here
```

### Database Setup
1. Create Supabase project
2. Run schema from `database/schema.sql`
3. Apply migrations from `database/migrations/` in order
4. Enable RLS policies (already included in schema)

### Local Development
- Supabase CLI configured in `supabase/config.toml`
- Local dev runs on port 54321 (API), 54322 (DB), 54323 (Studio)
- Uses PostgreSQL 17

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # shadcn/ui base components
│   ├── GameCard.tsx    # Individual game display
│   ├── LeaderboardTable.tsx
│   ├── UserManagement.tsx
│   └── ...
├── pages/              # Route components
│   ├── HomePage.tsx
│   ├── PickSheetPage.tsx
│   ├── LeaderboardPage.tsx
│   ├── AdminDashboard.tsx
│   └── ...
├── services/           # Business logic
│   ├── collegeFootballApi.ts  # CFBD API integration
│   ├── leaderboardService.ts  # Scoring calculations
│   ├── scoreCalculation.ts    # Point calculations
│   └── ...
├── hooks/              # Custom React hooks
│   └── useAuth.tsx     # Authentication logic
├── lib/                # Utilities and config
│   ├── supabase.ts     # Supabase client + types
│   ├── env.ts          # Environment variables
│   └── utils.ts        # General utilities
└── types/              # TypeScript definitions
    └── index.ts        # Core types
```

## Database Schema

### Core Tables
- **users**: User profiles (extends Supabase auth.users)
- **games**: Weekly game slate with spreads and scores
- **picks**: User selections with Lock picks and results
- **anonymous_picks**: System for handling picks before user assignment
- **week_settings**: Admin controls for each week
- **leaguesafe_payments**: Payment tracking integration
- **blog_posts**: Content management for weekly insights

### Key Features
- Row Level Security (RLS) enabled on all tables
- Automatic user profile creation via database triggers
- Real-time subscriptions for live updates
- Performance indexes for leaderboard queries

## Common Development Tasks

### Adding New Features
1. Check existing patterns in similar components
2. Update TypeScript types in `src/types/`
3. Follow existing naming conventions (camelCase for variables, PascalCase for components)
4. Use existing UI components from `src/components/ui/`
5. Implement proper error handling and loading states

### Database Changes
1. Create migration file in `database/migrations/`
2. Test locally with Supabase CLI
3. Update TypeScript types in `src/lib/supabase.ts`
4. Apply to production Supabase project

### Authentication Flow
- Uses Supabase Auth with email/password
- User profiles auto-created via database trigger
- Admin permissions controlled via `is_admin` flag
- Magic links supported for password reset

### Testing
- No formal test framework currently configured
- Test manually with development server
- Use Supabase local development for testing database changes
- Performance testing scripts in `scripts/`

## Brand Guidelines

**Colors:**
- Primary (Pigskin Brown): `#4B3621`
- Accent (Goal-Post Gold): `#C9A04E`
- Background: `#F8F7F3`
- Cards: Dark charcoal for contrast

**Tone:** Energetic, sporty, professional

## Security Notes

- All tables use Row Level Security (RLS)
- Users can only access their own picks before deadlines
- Admin-only access for game management and scoring
- API keys properly scoped (CFBD is read-only)
- No sensitive data in client-side code

## Performance Considerations

- Database indexes on frequently queried columns (week, season, user_id)
- Supabase Realtime limited to 10 events/second
- Image optimization for team logos
- Lazy loading for large leaderboard tables

## Deployment

**Vercel (Recommended):**
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables set in Vercel dashboard
- Automatic deployments from main branch

**Environment Variables for Production:**
- Set all VITE_ prefixed variables in deployment platform
- Supabase production URLs and keys
- CFBD API key for live data

## Troubleshooting

### Common Issues
- **RLS Policy Errors**: Check user authentication and table policies
- **API Rate Limits**: CFBD has generous limits, monitor usage
- **Build Errors**: Usually TypeScript type mismatches
- **Auth Issues**: Check Supabase project settings and redirect URLs

### Debug Tools
- Supabase Studio for database inspection
- Browser dev tools for client-side debugging
- Network tab for API call monitoring
- Authentication debugger component available

## AI Context Notes

This is a sports betting/fantasy sports application built for entertainment purposes. The platform handles:
- Game predictions (not real money betting)
- League management and administration
- User-generated content (picks and preferences)
- Payment tracking via LeagueSafe (third-party escrow)
- Automated scoring and leaderboards

The codebase follows React best practices with TypeScript for type safety and Supabase for backend services.