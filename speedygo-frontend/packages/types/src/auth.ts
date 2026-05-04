// User Roles
export type UserRole = 'CUSTOMER' | 'TRANSPORTER' | 'ADMIN' | 'SUPER_ADMIN';

// User Status
export type UserStatus = 'PENDING_KYC' | 'KYC_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export interface User {
  id: number;
  email: string;
  phone: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  profile_photo?: string;
  avatar_config?: AvatarConfig;
  fraud_score: number;
  warning_count: number;
  cancellation_count: number;
  is_available?: boolean;
  avg_rating?: number;
  total_ratings?: number;
  created_at: string;
  last_login_at?: string;
  fcm_token?: string;
}

export interface AvatarConfig {
  type: 'photo' | 'avatar' | 'initials';
  // 3D Avatar customization
  skinColor?: string;
  hairStyle?: string;
  hairColor?: string;
  eyeColor?: string;
  outfit?: string;
  accessory?: string;
  animation?: 'idle' | 'wave' | 'dance' | 'bounce';
  background?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  phone: string;
  password: string;
  full_name: string;
  role: 'CUSTOMER' | 'TRANSPORTER';
}

export interface RegisterResponse {
  message: string;
  email: string;
  otp_required: boolean;
  auth?: AuthResponse;
}

export interface LoginRequest {
  email: string;
  password?: string;
  login_method?: 'password' | 'otp';
  otp?: string;
}

export interface OTPVerifyRequest {
  email: string;
  otp: string;
}


export interface JWTClaims {
  user_id: number;
  email: string;
  role: UserRole;
  iss: string;
  exp: number;
  iat: number;
}

