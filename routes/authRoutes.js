import express from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

// --- 1. THE "NEVER-FAIL" TRANSPORTER CONFIG ---
// We use Port 465 + Family 4 to bypass Render's IPv6 routing issues.
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true for 465
  auth: {
    user: process.env.MY_EMAIL,
    pass: process.env.GOOGLE_APP_PASSWORD,
  },
  // CRITICAL: Forces IPv4 to prevent 'ENETUNREACH' on Render
  family: 4,
  // Safety timeouts
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 15000,
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
           style="background-color: #22d3ee; color: #000; padding: 12px 30px; border-radius: 30px; text-decoration: none; font-weight: bold; display: inline-block;">
           Open Studio
        </a>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${userEmail}`);
  } catch (error) {
    console.error("❌ Welcome email failed:", error.message);
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
          user = await User.create({
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails?.[0]?.value,
            profilePicture: profile.photos?.[0]?.value,
            provider: "google",
          });

          // Send welcome email in the background
          if (user.email) {
            sendWelcomeEmail(user.email, user.name);
          }
        } else {
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
        <h2 style="color: #22d3ee;">✅ IPv4 Test Successful</h2>
        <p>Sent from MediaLab at <b>${new Date().toLocaleString()}</b>.</p>
        <p>Your SMTP is now correctly routing through IPv4 on Render.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.send(`<h1>✅ Success!</h1><p>Test email sent to ${testEmail}.</p>`);
  } catch (error) {
    console.error("❌ Debug Test Failed:", error.message);
    res.status(500).send(`<h1>❌ Failed</h1><p>Error: ${error.message}</p>`);
  }
});

export default router;
