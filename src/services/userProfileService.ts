/**
 * User Profile Service
 * Handles user profile validation and automatic fixes for pick submission
 */

import { supabase } from '@/lib/supabase'

export interface ProfileValidationResult {
  isValid: boolean
  missingFields: string[]
  displayName?: string
  email?: string
  fixed?: boolean
}

export interface ProfileFixResult {
  success: boolean
  updatedFields: string[]
  error?: string
}

/**
 * Validate user profile for pick submission
 * Uses database function for comprehensive validation
 */
export async function validateUserProfileForPicks(userId: string): Promise<ProfileValidationResult> {
  try {
    console.log('🔍 Validating user profile for picks:', userId)
    
    const { data: validationResult, error } = await supabase
      .rpc('validate_user_profile_for_picks', { user_id: userId })
      .single()
    
    if (error) {
      console.error('❌ Profile validation function error:', error)
      throw error
    }
    
    return {
      isValid: validationResult.is_valid,
      missingFields: validationResult.missing_fields,
      displayName: validationResult.display_name,
      email: validationResult.email
    }
  } catch (error: any) {
    console.error('❌ Profile validation failed:', error)
    throw new Error(`Profile validation failed: ${error.message}`)
  }
}

/**
 * Attempt to automatically fix user profile issues
 * This can be called when validation fails to try and resolve issues
 */
export async function autoFixUserProfile(userId: string): Promise<ProfileFixResult> {
  try {
    console.log('🔧 Attempting to auto-fix user profile:', userId)
    
    // Get current user data
    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (fetchError) {
      throw new Error(`Could not fetch user data: ${fetchError.message}`)
    }
    
    const updatedFields: string[] = []
    const updates: any = {}
    
    // Fix display_name if missing
    if (!currentUser.display_name || currentUser.display_name.trim() === '') {
      if (currentUser.email) {
        updates.display_name = currentUser.email.split('@')[0]
        updatedFields.push('display_name')
        console.log('🔧 Setting display_name from email prefix:', updates.display_name)
      } else {
        updates.display_name = `User ${userId.substring(0, 8)}`
        updatedFields.push('display_name')
        console.log('🔧 Setting default display_name:', updates.display_name)
      }
    }
    
    // Apply updates if any
    if (updatedFields.length > 0) {
      const { error: updateError } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
      
      if (updateError) {
        throw new Error(`Could not update user profile: ${updateError.message}`)
      }
      
      console.log('✅ User profile fixed successfully:', updatedFields)
      return {
        success: true,
        updatedFields
      }
    }
    
    console.log('ℹ️ No profile fixes needed')
    return {
      success: true,
      updatedFields: []
    }
    
  } catch (error: any) {
    console.error('❌ Auto-fix user profile failed:', error)
    return {
      success: false,
      updatedFields: [],
      error: error.message
    }
  }
}

/**
 * Comprehensive profile check and fix
 * Validates profile and attempts to fix issues automatically
 */
export async function ensureValidUserProfile(userId: string): Promise<{
  isValid: boolean
  fixed: boolean
  error?: string
}> {
  try {
    // First validation
    let validation = await validateUserProfileForPicks(userId)
    
    if (validation.isValid) {
      console.log('✅ User profile is already valid')
      return { isValid: true, fixed: false }
    }
    
    console.log('⚠️ Profile validation failed, attempting auto-fix...')
    
    // Attempt to fix issues
    const fixResult = await autoFixUserProfile(userId)
    
    if (!fixResult.success) {
      console.error('❌ Could not auto-fix profile:', fixResult.error)
      return { 
        isValid: false, 
        fixed: false, 
        error: fixResult.error 
      }
    }
    
    // Re-validate after fixes
    validation = await validateUserProfileForPicks(userId)
    
    return {
      isValid: validation.isValid,
      fixed: fixResult.updatedFields.length > 0,
      error: validation.isValid ? undefined : `Still invalid after fixes: ${validation.missingFields.join(', ')}`
    }
    
  } catch (error: any) {
    console.error('❌ Profile ensure failed:', error)
    return {
      isValid: false,
      fixed: false,
      error: error.message
    }
  }
}

/**
 * Get detailed user profile information for debugging
 */
export async function getUserProfileDebugInfo(userId: string) {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (error) {
      throw error
    }
    
    const validation = await validateUserProfileForPicks(userId)
    
    return {
      user,
      validation,
      debugInfo: {
        hasDisplayName: !!user.display_name,
        displayNameLength: user.display_name?.length || 0,
        hasEmail: !!user.email,
        emailFormat: user.email ? user.email.includes('@') : false,
        createdAt: user.created_at,
        paymentStatus: user.payment_status
      }
    }
  } catch (error: any) {
    console.error('❌ Get profile debug info failed:', error)
    throw error
  }
}