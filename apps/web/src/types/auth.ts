export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
}

export interface Credentials {
  email: string;
  password: string;
}
