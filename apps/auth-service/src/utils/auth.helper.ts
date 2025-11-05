import crypto from "crypto";
import { NextFunction } from 'express';
import { ValidationError } from '../../../../packages/error-handler';
import redis from '../../../../packages/libs/redis';
import { sendEmail } from "./sendMail";
import path from "path";
import ejs from "ejs";
import nodemailer from 'nodemailer';


// 1. Email Regex 
export const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;


export const validateRegistrationData = (data: any, userType: "user" | "seller") => {
  const { name, email, password, phone_number,country } = data;

  if(
        !name ||
        !email||
        !password || 
        (userType === "seller" && (!phone_number|| !country))
    ) {
        throw new ValidationError(`Missing required fields!`)
    }

  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format!');
  }

  // ..............
};


// 3. Send Mail Helper [02:22:24]
interface IEmailOptions {
  email: string;
  subject: string;
  template: string;
  data: { [key: string]: any };
}

export const sendMail = async (options: IEmailOptions): Promise<void> => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: true, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const { email, subject, template, data } = options;

  // Get the path to the email template file
  const templatePath = path.join(__dirname, '../assets/emails', template);

  // Render the email template with EJS
  const html: string = await ejs.renderFile(templatePath, data);

  const mailOptions = {
    from: `Eshop <${process.env.SMTP_USER}>`,
    to: email,
    subject,
    html,
  };

  await transporter.sendMail(mailOptions);
};


// 4. Send OTP Helper [02:11:20]
export const sendOtp = async (
    email: string,
    name: string,
    template: string
) => {
  const otp = crypto.randomInt(1000 ,9999).toString(); // 4-digit OTP
  await sendEmail(email, "Verify Your Email", template, {name, otp});  
  
  // Key: "otp:user@example.com", Value: 1234
  await redis.set(`otp:${email}`, otp, 'EX', 300);
  await redis.set(`otp_cooldown:${email}`, "true", "EX", 60); 
  
};
export const checkOtpRestrictions = async (
    email: string,
    next: NextFunction) => {
        if(await redis.get(`otp_lock:${email}`)){
            return next(new ValidationError(
                "Account locked due to multiple failed attempts! Try again after 30 minutes"
            )
        );
        }
        if(await redis.get(`otp_spam_lock:${email}`)){
            return next(new ValidationError("Too many OTP request! Please wait 1 hour before requesting again.")
        );
        }
        if(await redis.get(`otp-cooldown:${email}`)){
            return next(
                new ValidationError(
                    "Please wait 1 minute before requesting a new OTP.")
            )
        
        }  
};

export const trackOtpRequests= async (email:string,next:NextFunction) =>{
    const otpRequestKey =`otp_request_count:${email}`;
    let otpRequests = parseInt((await redis.get(otpRequestKey)) || "0");

    if(otpRequests>= 2){
        await redis.set(`otp_spam_lock:${email}`, "locked", "EX", 3600);
        return next(new ValidationError("Too many OTP requests. Please wait 1 hour before requesting again."));
    }

    await redis.set(otpRequestKey, otpRequests + 1, "EX", 3600);  
};