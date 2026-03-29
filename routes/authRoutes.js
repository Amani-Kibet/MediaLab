import express from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // Must be false for port 587
  auth: {
    user: process.env.MY_EMAIL,
    pass: process.env.GOOGLE_APP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false, // Helps bypass certain cloud restrictions
  },
});

// Helper function for sending the welcome email
const sendWelcomeEmail = async (userEmail, userName) => {
  const mailOptions = {
    from: `"MediaLab Studio" <${process.env.MY_EMAIL}>`,
    to: userEmail,
    subject: "Welcome to MediaLab Studio! 🚀",
    html: `
      <div style="background-color: #030712; color: #f3f4f6; font-family: sans-serif; padding: 40px; text-align: center; border-radius: 20px;">
        <div style="display: inline-block; width: 50px; height: 50px; background-color: #22d3ee; border-radius: 50%; line-height: 50px; font-size: 24px; font-weight: bold; color: #000; margin-bottom: 20px;">
          M
        </div>
        <h1 style="font-size: 28px; margin-bottom: 10px;">Welcome, ${userName}!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin-bottom: 30px;">Your ultimate AI creative studio is ready. Start converting and editing today.</p>
        <a href="https://your-medialab-url.com" 
           style="background-color: #22d3ee; color: #000; padding: 12px 30px; border-radius: 30px; text-decoration: none; font-weight: bold;">
           Open Studio
        </a>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${userEmail}`);
  } catch (error) {
    console.error("❌ Welcome email failed:", error);
  }
};

// --- 2. PASSPORT SERIALIZATION ---
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// --- 3. GOOGLE STRATEGY ---
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          // New User signup
          user = await User.create({
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails?.[0]?.value,
            profilePicture: profile.photos?.[0]?.value,
            provider: "google",
          });

          // Trigger Welcome Email (Don't await, let it run in background)
          if (user.email) {
            sendWelcomeEmail(user.email, user.name);
          }
        } else {
          // Existing User login
          user.lastLogin = new Date();
          await user.save();
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    },
  ),
);

// --- 4. AUTH ROUTES ---

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/?login=failed" }),
  (req, res) => res.redirect("/?loggedIn=true"),
);

router.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.redirect("/");
  });
});

router.get("/me", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        profilePicture: req.user.profilePicture,
        provider: req.user.provider,
      },
    });
  } else res.json({ success: false });
});

// --- 5. DEBUG TEST EMAIL ROUTE ---
router.get("/test-email", async (req, res) => {
  const testEmail = "amanikbt2@gmail.com";

  const mailOptions = {
    from: `"MediaLab Studio" <${process.env.MY_EMAIL}>`,
    to: testEmail,
    subject: "Test Email from MediaLab",
    html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2 style="color: #22d3ee;">✅ This is a test email</h2>
        <p>Hello, this email was sent from your MediaLab server at <b>${new Date().toLocaleString()}</b>.</p>
        <p>If you received this, your email setup is working correctly.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Test email sent successfully to ${testEmail}`);
    res.send(
      `<h1>✅ Test email sent to ${testEmail}</h1><p>Check inbox and spam folder.</p> Test Details: ${process.env.GOOGLE_APP_PASSWORD} and ${process.env.MY_EMAIL}`,
    );
  } catch (error) {
    console.error(
      `❌ Email failed: Test Details: ${process.env.GOOGLE_APP_PASSWORD} and ${process.env.MY_EMAIL}`,
      error,
    );
    res
      .status(500)
      .send(
        `<h1>❌ Failed to send email</h1><p>Error:Test Details: ${process.env.GOOGLE_APP_PASSWORD} and ${process.env.MY_EMAIL} ${error.message}</p>`,
      );
  }
});

export default router;
