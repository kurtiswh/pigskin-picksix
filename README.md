# Pigskin Pick Six Pro

A modern, mobile-first web platform for college football pick 'em contests. Built for organizers and players who want to automate weekly pick sheets, live scoring, and championship tracking.

## 🏈 Features

- **Mobile-First Design**: Optimized for the sporty, energetic Pigskin Pick Six brand
- **Smart Pick System**: Choose 6 games ATS with one Lock pick for double points
- **Live Scoring**: Real-time updates with 20/10/0 point system plus bonus tiers
- **Championship Tracking**: Season-long leaderboard + special "Best Finish" (weeks 11-14)
- **Admin Tools**: Game selection, spread management, LeagueSafe integration
- **AI Insights**: Automated weekly recaps and pick distribution analysis

## 🚀 Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Styling**: Tailwind CSS with custom Pigskin Pick Six brand colors
- **UI Components**: shadcn/ui with custom sports theming
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **External APIs**: CollegeFootballData.com (free) with optional Sportradar upgrade
- **Deployment**: Ready for Vercel/Netlify

## 🎨 Brand Colors

- **Primary (Pigskin Brown)**: `#4B3621`
- **Accent (Goal-Post Gold)**: `#C9A04E`
- **Background**: Off-white `#F8F7F3`
- **Cards**: Dark charcoal for contrast

## 📋 Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- CollegeFootballData.com API access (free)

## 🛠️ Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd PP6
npm install
```

### 2. Environment Configuration

Copy the example environment file and fill in your values:

```bash
cp .env.example .env.local
```

Required environment variables:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_CFBD_API_KEY=your_cfbd_api_key_here
```

### 3. Database Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. In the SQL Editor, run the schema from `database/schema.sql`
3. This will create all tables, RLS policies, and helper functions

### 4. Authentication Setup

In your Supabase dashboard:
1. Go to Authentication → Settings
2. Enable email/password authentication
3. Optional: Enable Google OAuth and configure redirect URLs

### 5. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` to see the application.

## 📁 Project Structure

```
src/
├── components/          # Reusable UI components
│   └── ui/             # shadcn/ui base components
├── hooks/              # Custom React hooks
├── lib/                # Utilities and configurations
├── pages/              # Route components
├── styles/             # Global styles and Tailwind config
└── types/              # TypeScript type definitions

database/
└── schema.sql          # Complete database schema

public/                 # Static assets
```

## 🔧 Key Components

- **Authentication**: Email/password + Google OAuth via Supabase Auth
- **Pick System**: 6-pick maximum with 1 Lock per week constraint
- **Scoring Engine**: Automatic point calculation with database triggers
- **Real-time Updates**: Supabase Realtime for live leaderboard changes
- **Admin Panel**: Game selection and league management tools

## 🏆 Scoring System

- **Win**: 20 points (40 for Lock picks)
- **Push**: 10 points (20 for Lock picks)  
- **Loss**: 0 points
- **Bonus Tiers**: +1/+3/+5 point bonuses for consistency (implementation TBD)

## 📊 Database Schema

### Core Tables
- `users` - User profiles linked to Supabase Auth
- `games` - Weekly game slate with spreads and scores
- `picks` - User selections with results and points
- `week_settings` - Admin controls for each week

### Views
- `weekly_leaderboard` - Rankings by week
- `season_leaderboard` - Season-long standings

## 🔐 Security

- Row Level Security (RLS) enabled on all tables
- Users can only modify their own picks before deadlines
- Admin-only access for game and settings management
- Automatic user profile creation via database triggers

## 🚀 Deployment

The application is ready to deploy to:

### Vercel (Recommended)
```bash
npm run build
# Deploy to Vercel
```

### Netlify
```bash
npm run build
# Deploy dist/ folder to Netlify
```

Make sure to set environment variables in your deployment platform.

## 🧪 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Adding New Features

1. Update database schema in `database/schema.sql`
2. Update TypeScript types in `src/types/`
3. Create new components/pages as needed
4. Test with development Supabase project

## 🎯 Roadmap

- [ ] Complete pick sheet interface
- [ ] Live scoring integration
- [ ] CollegeFootballData API integration
- [ ] Admin dashboard with game selection
- [ ] LeagueSafe CSV upload and matching
- [ ] AI-powered weekly insights
- [ ] Mobile app (React Native)
- [ ] Advanced analytics dashboard

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

This project is proprietary software for Pigskin Pick Six Pro.

---

**"Where meaningless games become meaningful"** 🏈