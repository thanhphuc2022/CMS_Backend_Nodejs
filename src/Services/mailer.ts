import nodemailer from 'nodemailer';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as ejs from 'ejs';
import * as path from 'path';
import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export class OtpEmailDeliveryError extends Error {
  readonly cause?: unknown;
  constructor(readonly code: 'EMAIL_CREDENTIALS_MISSING' | 'OTP_TEMPLATE_UNAVAILABLE' | 'GMAIL_SMTP_REJECTED', cause?: unknown) {
    super(code);
    this.name = 'OtpEmailDeliveryError';
    this.cause = cause;
  }
}

export async function sendOtpEmail(email: string, otp: string, purpose: 'registration' | 'password-reset') {
  const emailAddress = process.env.EMAIL_ADDRESS;
  const emailPassword = process.env.EMAIL_PASSWORD;
  console.info(`Gmail SMTP environment: EMAIL_ADDRESS=${emailAddress ? 'present' : 'missing'}, EMAIL_PASSWORD=${emailPassword ? 'present' : 'missing'}`);
  if (!emailAddress || !emailPassword) throw new OtpEmailDeliveryError('EMAIL_CREDENTIALS_MISSING');
  const templateName = purpose === 'registration' ? 'templateEmail.ejs' : 'templateEmail_forgotpassword.ejs';
  const templatePath = path.join(__dirname, '../themeEmail', templateName);
  let renderedTemplate: string;
  try {
    renderedTemplate = ejs.render(fs.readFileSync(templatePath, 'utf8'), { otp });
  } catch (error) {
    throw new OtpEmailDeliveryError('OTP_TEMPLATE_UNAVAILABLE', error);
  }
  try {
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: { user: emailAddress, pass: emailPassword }
    });
    await transporter.sendMail({
      from: emailAddress,
      to: email,
      subject: purpose === 'registration' ? 'Mã xác nhận đăng ký' : 'Mã xác nhận đặt lại mật khẩu',
      text: `Mã xác nhận của bạn là ${otp}`,
      html: renderedTemplate
    });
  } catch (error) {
    throw new OtpEmailDeliveryError('GMAIL_SMTP_REJECTED', error);
  }
}

export const contact = async function Email(req: Request, res: Response) {
  const { subject, text } = req.body;
  if (typeof subject !== 'string' || typeof text !== 'string' || subject.length > 200 || text.length > 10000 || /[\r\n]/.test(subject)) {
    return res.status(400).json({ message: 'Nội dung liên hệ không hợp lệ' });
  }
  if (!process.env.EMAIL_API) return res.status(503).json({ message: 'Dịch vụ email chưa được cấu hình' });
  try {
    sgMail.setApiKey(process.env.EMAIL_API);
    await sgMail.send({ to: 'truonglochg0192@gmail.com', from: 'demowebtest68@gmail.com', subject, text });
    return res.json('Đã gửi thành công');
  } catch {
    return res.status(502).json({ message: 'Không thể gửi liên hệ' });
  }
};

export const contact2 = async function Email2(req: Request, res: Response) {
  const { contact, subject, info, text } = req.body;
  if ([contact, subject, info, text].some((value) => typeof value !== 'string') ||
      contact.length > 200 || subject.length > 200 || /[\r\n]/.test(subject) || info.length > 500 || text.length > 10000) {
    return res.status(400).json({ message: 'Nội dung liên hệ không hợp lệ' });
  }
  if (!process.env.EMAIL_ADDRESS || !process.env.EMAIL_PASSWORD) {
    return res.status(503).json({ message: 'Dịch vụ email chưa được cấu hình' });
  }
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character] as string);
  try {
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: { user: process.env.EMAIL_ADDRESS, pass: process.env.EMAIL_PASSWORD }
    });
    await transporter.sendMail({
      from: process.env.EMAIL_ADDRESS,
      to: 'tinhocnhuy@gmail.com',
      subject,
      html: `<b>${escapeHtml(info)}</b><b>Nội dung:</b><p>${escapeHtml(text)}</p>`
    });
    return res.json({ mess: 'da gui thanh cong' });
  } catch {
    return res.status(502).json({ message: 'Không thể gửi liên hệ' });
  }
};
