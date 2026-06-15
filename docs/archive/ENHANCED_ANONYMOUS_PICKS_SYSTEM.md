# Enhanced Anonymous Picks Validation & User Merge System

This document outlines the comprehensive solution for addressing anonymous picks validation issues and preventing duplicate user accounts.

## System Overview

The enhanced system addresses the following critical issues:

1. **Duplicate User IDs**: Users ending up with multiple accounts for different emails
2. **Weak Anonymous Picks Validation**: Assignments without proper user verification
3. **Missing Duplicate Detection**: No systematic check across both picks tables
4. **Payment Status Blind Spots**: Validation ignoring payment requirements
5. **Manual Conflict Resolution Gaps**: No clear guidance for admin decisions

## Core Components

### 1. Primary User Resolution System (`112_create_primary_user_resolution_system.sql`)

**Purpose**: Ensures every email resolves to a single canonical user ID

**Key Features**:
- `resolve_primary_user_id(email)` function returns canonical user ID for any email
- `canonical_user_id` column in users table for consolidation tracking
- `user_status` column to track merged/active accounts
- `is_primary_user_email` flag for email designation
- User consolidation functions with conflict handling

**Database Functions**:
```sql
-- Resolve any email to primary user ID
SELECT resolve_primary_user_id('user@example.com');

-- Consolidate secondary user under primary
SELECT consolidate_user_under_primary(secondary_id, primary_id, admin_id);

-- Find all pick sets for a user (both authenticated and anonymous)
SELECT * FROM find_all_user_pick_sets(user_id, week, season);
```

### 2. Enhanced Anonymous Picks Service (`enhancedAnonymousPicksService.ts`)

**Purpose**: Comprehensive validation engine with payment and conflict detection

**Key Features**:
- Primary user ID resolution for all emails
- Comprehensive duplicate detection across both tables
- Payment status integration with leaderboard rules
- Conflict resolution with detailed pick set comparison
- Forced validation workflow with multiple verification steps

**Key Methods**:
```typescript
// Validate anonymous pick assignment
const validation = await EnhancedAnonymousPicksService.validateAnonymousPickAssignment(
  email, week, season
);

// Find conflicts across all pick sources
const conflicts = await EnhancedAnonymousPicksService.findAllUserPickSets(
  userId, week, season
);

// Force assign with validation status
await EnhancedAnonymousPicksService.forceAssignAnonymousPicksToUser(
  pickIds, userId, showOnLeaderboard, validationStatus, notes
);
```

### 3. Enhanced Validation Workflow (`EnhancedAnonymousPicksAdmin.tsx`)

**Purpose**: Multi-step validation UI that forces proper verification

**Workflow Steps**:
1. **Email Verification**: Resolve email to primary user ID
2. **User Assignment**: Manual search/assign if no user found  
3. **Conflict Resolution**: Choose between competing pick sets
4. **Payment Verification**: Check payment status for leaderboard eligibility
5. **Final Confirmation**: Review and confirm assignment with audit trail

**Key Benefits**:
- No assignments without completing full validation
- Payment status checked before leaderboard inclusion
- All conflicts must be resolved by admin choice
- Comprehensive audit trail for all decisions

### 4. Pick Precedence Management (`113_add_pick_precedence_management.sql`)

**Purpose**: Systematic handling of conflicts between authenticated and anonymous picks

**Key Features**:
- `is_active_pick_set` column on picks table
- `pick_set_priority` for precedence ranking
- Admin functions to set pick set precedence
- Audit trail for all precedence decisions
- Helper views to identify conflicts

**Database Functions**:
```sql
-- Manage which pick set is active for a user
SELECT manage_pick_set_precedence(user_id, week, season, 'authenticated', NULL, admin_id, 'reason');

-- Get current precedence status
SELECT * FROM get_pick_precedence_status(user_id, week, season);

-- Calculate points respecting precedence rules
SELECT * FROM calculate_user_points_with_precedence(user_id, week, season);
```

### 5. Enhanced Auth Service (`enhancedAuthService.ts`)

**Purpose**: Authentication that always resolves to primary user IDs

**Key Features**:
- Login resolution to canonical user ID
- Session initialization with primary user resolution
- Multi-account detection and consolidation suggestions
- Magic link integration with user resolution

## Implementation Guide

### Step 1: Apply Database Migrations

```bash
# Apply the migrations in order
psql -d your_database -f database/migrations/111_fix_user_merge_constraint.sql
psql -d your_database -f database/migrations/112_create_primary_user_resolution_system.sql  
psql -d your_database -f database/migrations/113_add_pick_precedence_management.sql
```

### Step 2: Update Admin Dashboard

Replace the existing anonymous picks admin with the wrapper:

```tsx
// In your AdminDashboard.tsx
import AnonymousPicksAdminWrapper from '@/components/AnonymousPicksAdminWrapper'

// Replace existing AnonymousPicksAdmin with:
<AnonymousPicksAdminWrapper 
  currentWeek={currentWeek} 
  currentSeason={currentSeason} 
/>
```

### Step 3: Optional: Update Auth System

To use enhanced auth with primary user resolution:

```tsx
// Replace existing useAuth with enhanced version
import { EnhancedAuthService } from '@/services/enhancedAuthService'

// In your login component
const result = await EnhancedAuthService.signInWithEmail(email, password);
if (result.success) {
  // User is automatically resolved to primary account
  setUser(result.user);
}
```

## Usage Workflow

### For Anonymous Picks Validation

1. **Load Anonymous Picks**: System shows unvalidated anonymous pick sets
2. **Click "Start Enhanced Validation"**: Launches multi-step workflow
3. **Email Resolution**: System automatically resolves email to primary user ID
4. **Conflict Detection**: Shows all existing pick sets for that user
5. **Payment Check**: Verifies payment status for leaderboard eligibility  
6. **Admin Decision**: Choose which pick set should be active
7. **Assignment**: System assigns with proper validation status and audit trail

### For User Consolidation

When duplicate users are detected:

```sql
-- Check for multiple accounts
SELECT * FROM user_emails WHERE email = 'user@example.com';

-- Consolidate under primary user  
SELECT consolidate_user_under_primary(
  '00000000-0000-0000-0000-000000000002', -- secondary user
  '00000000-0000-0000-0000-000000000001', -- primary user  
  '00000000-0000-0000-0000-000000000003'  -- admin user
);
```

### For Pick Precedence Management

When users have both authenticated and anonymous picks:

```sql
-- Set authenticated picks as active
SELECT manage_pick_set_precedence(
  user_id, 
  week, 
  season, 
  'authenticated', 
  NULL, 
  admin_id, 
  'Authenticated picks take precedence'
);

-- Or set specific anonymous pick set as active
SELECT manage_pick_set_precedence(
  user_id, 
  week, 
  season, 
  'anonymous', 
  'anon_2024-12-01 10:30:00',
  admin_id, 
  'User requested anonymous picks be used'
);
```

## Key Benefits

### For Administrators
- **Forced Validation**: No more accidental assignments without proper verification
- **Comprehensive Conflict View**: See all pick sets with results and timing
- **Payment Integration**: Automatic check of payment status before leaderboard inclusion
- **Audit Trail**: Complete history of all validation decisions
- **Duplicate Prevention**: System prevents creation of multiple user accounts

### For Users  
- **Single Account**: Login with any email resolves to primary account
- **No Lost Picks**: All picks preserved during account consolidation
- **Consistent Experience**: Same user experience regardless of which email used for login

### For System Integrity
- **Data Consistency**: Primary user ID system prevents data fragmentation
- **Conflict Resolution**: Systematic handling of competing pick sets
- **Payment Enforcement**: Only paid users appear on leaderboards by default
- **Precedence Rules**: Clear hierarchy for authenticated vs anonymous picks

## Troubleshooting

### Common Issues

1. **Migration Errors**: Ensure migrations are applied in order and check for foreign key constraint issues
2. **User Resolution Failures**: Check that `user_emails` table is properly populated
3. **Pick Conflicts**: Use `get_pick_precedence_status()` to understand current state
4. **Payment Status**: Verify `leaguesafe_payments` data is up to date

### Debug Queries

```sql
-- Check user consolidation status
SELECT u.id, u.email, u.user_status, u.canonical_user_id, ue.email as all_emails
FROM users u
LEFT JOIN user_emails ue ON u.id = ue.user_id
WHERE u.email ILIKE '%example%'
ORDER BY u.created_at;

-- Check pick conflicts for a user
SELECT * FROM pick_conflicts_needing_resolution 
WHERE email ILIKE '%example%';

-- Check precedence status
SELECT * FROM get_pick_precedence_status('user-uuid', 14, 2024);
```

## Future Enhancements

1. **Automated Consolidation**: Rules-based automatic user consolidation
2. **Enhanced Precedence Rules**: More sophisticated priority algorithms  
3. **User Self-Service**: Allow users to consolidate their own accounts
4. **Advanced Conflict Resolution**: AI-assisted conflict resolution suggestions
5. **Performance Optimizations**: Caching for frequently accessed user resolutions

This system provides a comprehensive solution to the anonymous picks validation and user management challenges, ensuring data integrity while maintaining a smooth admin experience.