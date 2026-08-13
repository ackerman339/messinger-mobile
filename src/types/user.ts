export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

export interface User {
  id: string;
  username: string;
  userCode: string;
  avatarUrl: string | null;
  loginKey: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  accessToken: string;
  refreshToken: string;
}
