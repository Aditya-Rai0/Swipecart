// import { Request, Response, NextFunction } from 'express';

// import { AuthError, ValidationError, AppError } from '../../../../packages/error-handler';
// import prisma from "../../../../packages/libs/prisma";

// import redis from '../../../../packages/libs/redis';

// import {
//   validateRegistrationData,
//   checkOtpRestrictions,
//   sendOtp
// } from '../utils/auth.helper';


// export const userRegistration = async (req: Request, res: Response, next: NextFunction) => {
//   try {
//     validateRegistrationData(req.body, "user");

//     const { name, email } = req.body;

//     const existingUser = await prisma.user.findUnique({ where: { email } });
//     if (existingUser) {
//       return new ValidationError('User already exists with this email');
//     }

    
//     await checkOtpRestrictions(email, next);

//     // Step 4: OTP Bhejo
//     await sendOtp(email, name);

//     // Step 5: Cooldown set karo (taaki user 1 minute tak naya OTP na maang sake)
//     await redis.set(`otp-cooldown:${email}`, 'true', 'EX', 60); // 60 seconds

//     res.status(200).json({
//       success: true,
//       message: 'OTP sent to your email. Please verify your account.',
//     });

//   } catch (error) {
//     // Step 6: Error ko humare error middleware par bhej do
//     next(error); 
//   }
// };

// // 2. Verify User (Yeh agla step hoga)
// export const verifyUser = async (req: Request, res: Response, next: NextFunction) => {
//   // Yeh hum baad mein banayenge [03:16:34]
//   res.status(200).json({ message: 'Verify user endpoint (to be built)' });
// };

// // 3. Login User (Yeh bhi baad mein banayenge)
// export const loginUser = async (req: Request, res: Response, next: NextFunction) => {
//   // Yeh hum baad mein banayenge [03:36:20]
//   res.status(200).json({ message: 'Login user endpoint (to be built)' });
// };

// // ... baaki functions



// apps/auth-service/src/controllers/auth.controller.ts

import { Request, Response, NextFunction } from 'express';
import { AuthError, ValidationError, NotFoundError, ForbiddenError } from '../../../../packages/error-handler';
import prisma from '../../../../packages/libs/prisma';
import redis from '../../../../packages/libs/redis';
import { trackOtpRequests } from '../utils/auth.helper';
import {
  validateRegistrationData,
  checkOtpRestrictions,
  sendOtp,
//   verifyOtp, // [03:19:51]
//   verifyForgotPasswordOtp // [03:56:41]
} from '../utils/auth.helper';
// import {setCookie}  from '../../../../utils/setCookie'; // [03:41:48]
// import { setCookie } from '../../../../packages/utils/setCookie'; // Update path if setCookie exists here
import bcrypt from 'bcryptjs'; // [03:25:53]
import jwt from 'jsonwebtoken'; // [03:39:36]

// 1. User Registration (Jo aapne banaya)
export const userRegistration = async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateRegistrationData(req.body, 'user');

    const { name, email } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      
      return next(new ValidationError('User already exists with this email'));
    };

    await checkOtpRestrictions(email, next);
    await trackOtpRequests(email,next)
    
    
    await sendOtp(email, name, "user-activation-mail");

    await redis.set(`otp-cooldown:${email}`, 'true', 'EX', 60); // 60 seconds cooldown

    res.status(200).json({
      success: true,
      message: 'OTP sent to your email. Please verify your account.',
    });

  } catch (error) {
    next(error);
  }
};

// 2. Verify User (OTP aur Password ke saath) [03:16:34]
export const verifyUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, otp } = req.body;

    if (!name || !email || !password || !otp) {
      throw new ValidationError('All fields are required');
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new AuthError('User already exists with this email');
    }

    // OTP ko helper se verify karo
    await verifyOtp(email, otp, next);

    // Password ko hash karo
    const hashedPassword = await bcrypt.hash(password, 10);

    // Naya user create karo
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });

  } catch (error) {
    next(error);
  }
};

// 3. Login User [03:36:20]
export const loginUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AuthError('Invalid email or password');
    }

    if (!user.password) {
        throw new AuthError('User registered with social media. Cannot login with password.');
    }

    // Password compare karo
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AuthError('Invalid email or password');
    }

    // Tokens create karo
    const accessToken = jwt.sign(
      { id: user.id, role: 'user' },
      process.env.ACCESS_TOKEN_SECRET!,
      { expiresIn: '15m' }
    );
    const refreshToken = jwt.sign(
      { id: user.id, role: 'user' },
      process.env.REFRESH_TOKEN_SECRET!,
      { expiresIn: '7d' }
    );

    // Cookies set karo [03:41:48]
    setCookie(res, 'access_token', accessToken);
    setCookie(res, 'refresh_token', refreshToken);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
      },
      accessToken,
    });

  } catch (error) {
    next(error);
  }
};

// 4. Refresh Token [04:03:06]
export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies.refresh_token;
    if (!refreshToken) {
      throw new AuthError('Unauthorized: No refresh token');
    }

    // Token verify karo
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!);
    } catch (err) {
      throw new ForbiddenError('Forbidden: Invalid refresh token');
    }

    if (!decoded.id || !decoded.role) {
      throw new ForbiddenError('Forbidden: Invalid token payload');
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Naya access token issue karo
    const newAccessToken = jwt.sign(
      { id: user.id, role: decoded.role },
      process.env.ACCESS_TOKEN_SECRET!,
      { expiresIn: '15m' }
    );

    setCookie(res, 'access_token', newAccessToken);

    res.status(200).json({
      success: true,
      accessToken: newAccessToken,
    });

  } catch (error) {
    next(error);
  }
};

// 5. Forgot Password (OTP Bhejna) [03:48:11]
export const userForgotPassword = async (req: Request, res: Response, next: NextFunction, p0: string) => {
  try {
    // Logic ko helper mein daal diya hai (video ke according)
    await userForgotPassword(req, res, next, 'user');
  } catch (error) {
    next(error);
  }
};

// 6. Verify Forgot Password (OTP Check karna) [03:56:41]
export const verifyUserForgotPassword = async (req: Request, res: Response, next: NextFunction, p0?: string) => {
  try {
    // Logic ko helper mein daal diya hai
    await verifyUserForgotPassword(req, res, next, 'user');
  } catch (error) {
    next(error);
  }
};

// 7. Reset Password (Naya password set karna) [03:52:56]
export const resetUserPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      throw new ValidationError('Email and new password are required');
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.password) {
        throw new AuthError('Cannot reset password for social login user.');
    }

    // Check karo naya password purane jaisa toh nahi
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new ValidationError('New password cannot be the same as the old password');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. Please login with your new password.',
    });

  } catch (error) {
    next(error);
  }
};

function verifyOtp(email: any, otp: any, next: NextFunction) {
    throw new Error('Function not implemented.');
}


function setCookie(res: Response<any, Record<string, any>>, arg1: string, accessToken: string) {
    throw new Error('Function not implemented.');
}
