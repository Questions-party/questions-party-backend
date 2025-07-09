const Dm20151123 = require('@alicloud/dm20151123').default;
const {SingleSendMailRequest} = require('@alicloud/dm20151123');
const OpenApi = require('@alicloud/openapi-client');
const Util = require('@alicloud/tea-util');
const Credential = require('@alicloud/credentials').default;
const i18n = require('./i18n');
const Config = require('../config/config');

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} True if email format is valid
 */
const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

class MailUtils {
    constructor() {
        this.client = null;
        this.fromAddress = "questions-party@questions-party.space";
        this.initClient();
    }

    /**
     * Initialize the email client
     */
    initClient() {
        try {
            // Initialize credentials
            let credential = new Credential({
                // Credential type.
                type: 'access_key',
                // Set the accessKeyId value. This example retrieves the accessKeyId from environment variables.
                accessKeyId: Config.aliyun.accessKeyId,
                // Set the accessKeySecret value. This example retrieves the accessKeySecret from environment variables.
                accessKeySecret: Config.aliyun.accessKeySecret,
            });
            let config = new OpenApi.Config({
                credential: credential,
            });
            // Endpoint for Alicloud mail service
            config.endpoint = `dm.aliyuncs.com`;
            this.client = new Dm20151123(config);
        } catch (error) {
            console.error('Failed to initialize mail client:', error);
            throw error;
        }
    }

    /**
     * Send a basic email
     * @param {string} toAddress - Recipient email address
     * @param {string} subject - Email subject
     * @param {string} textBody - Email content
     * @returns {Promise<boolean>} Success status
     */
    async sendEmail(toAddress, subject, textBody) {
        if (!this.client) {
            throw new Error('Mail client not initialized');
        }

        try {
            const singleSendMailRequest = new SingleSendMailRequest({
                accountName: this.fromAddress,
                addressType: 1,
                replyToAddress: false,
                toAddress: toAddress,
                subject: subject,
                textBody: textBody,
            });

            const runtime = new Util.RuntimeOptions({});
            await this.client.singleSendMailWithOptions(singleSendMailRequest, runtime);

            console.log(`Email sent successfully to ${toAddress}`);
            return true;
        } catch (error) {
            console.error('Failed to send email:', error.message);
            if (error.data && error.data["Recommend"]) {
                console.error('Diagnostic:', error.data["Recommend"]);
            }
            throw error;
        }
    }

    /**
     * Send a verification code email with locale support
     * @param {string} toAddress - Recipient email address
     * @param {string} verificationCode - The verification code to send
     * @param {string} locale - Language locale (e.g., 'en', 'zh')
     * @returns {Promise<boolean>} Success status
     */
    async sendVerificationEmail(toAddress, verificationCode, locale = 'en') {
        try {
            // Get localized subject and body
            const subject = i18n.t('mail.verificationSubject', locale);
            const bodyTemplate = i18n.t('mail.verificationBody', locale, {
                code: verificationCode
            });

            // Fallback to English template if translation not found
            const finalSubject = subject.includes('mail.') ?
                'Questions Party - Email Verification' : subject;

            const finalBody = bodyTemplate.includes('mail.') ?
                `Your verification code is: ${verificationCode}\n\nPlease enter this code to verify your email address.\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this verification, please ignore this email.` :
                bodyTemplate;

            return await this.sendEmail(toAddress, finalSubject, finalBody);
        } catch (error) {
            console.error('Failed to send verification email:', error);
            throw error;
        }
    }

    /**
     * Send a password reset email with locale support
     * @param {string} toAddress - Recipient email address
     * @param {string} resetCode - The password reset code
     * @param {string} locale - Language locale (e.g., 'en', 'zh')
     * @returns {Promise<boolean>} Success status
     */
    async sendPasswordResetEmail(toAddress, resetCode, locale = 'en') {
        try {
            const subject = i18n.t('mail.passwordResetSubject', locale);
            const bodyTemplate = i18n.t('mail.passwordResetBody', locale, {
                code: resetCode
            });

            // Fallback to English template if translation not found
            const finalSubject = subject.includes('mail.') ?
                'Questions Party - Password Reset' : subject;

            const finalBody = bodyTemplate.includes('mail.') ?
                `Your password reset code is: ${resetCode}\n\nPlease enter this code to reset your password.\n\nThis code will expire in 5 minutes.\n\nIf you didn't request a password reset, please ignore this email.` :
                bodyTemplate;

            return await this.sendEmail(toAddress, finalSubject, finalBody);
        } catch (error) {
            console.error('Failed to send password reset email:', error);
            throw error;
        }
    }

    /**
     * Get the sender address
     * @returns {string} From email address
     */
    getFromAddress() {
        return this.fromAddress;
    }

    /**
     * Set a custom sender address
     * @param {string} address - New sender email address
     */
    setFromAddress(address) {
        this.fromAddress = address;
    }
}

// Create and export singleton instance
const mailUtils = new MailUtils();

// Export both the singleton and utility functions
module.exports = {
    mailUtils,
    validateEmail
}; 