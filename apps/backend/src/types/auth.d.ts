import '@auth/core/types';

declare module '@auth/core/types' {
  interface User {
    passwordResetVersion?: number;
  }
  interface Session {
    passwordResetVersion?: number;
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
