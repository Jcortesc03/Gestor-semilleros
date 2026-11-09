// Public, dependency-light SMTP API; importing the module barrel would create an auth cycle.
export { SmtpEmailSender } from './services/channels/smtp-email.sender';
