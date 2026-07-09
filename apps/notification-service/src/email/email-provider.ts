/**
 * Structure representing the core contents of an email message.
 */
export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/**
 * Parameter object containing the required arguments to dispatch an email.
 */
export interface SendEmailOptions {
  to: string;
  content: EmailContent;
}

/**
 * Contract interface for outbox email dispatchers.
 * Serves as the base Strategy interface in the Strategy Design Pattern.
 */
export interface EmailProvider {
  /**
   * Sends an email based on the options provided.
   *
   * @param options - The email dispatch configuration options.
   * @returns A promise that resolves when the email is successfully sent.
   */
  send(options: SendEmailOptions): Promise<void>;
}
