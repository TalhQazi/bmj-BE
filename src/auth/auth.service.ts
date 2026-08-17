import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto, LoginDto } from './dto/auth.dto';
import * as crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'benchmark-justice-super-secret-auth-key-2026';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Hashes a password with a random 16-byte salt using PBKDF2 (SHA-512).
   */
  private hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Verifies whether a plaintext password matches the stored salted hash.
   */
  private verifyPassword(password: string, storedHash: string): boolean {
    const [salt, originalHash] = storedHash.split(':');
    if (!salt || !originalHash) return false;
    const hashToVerify = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(originalHash, 'hex'), Buffer.from(hashToVerify, 'hex'));
  }

  /**
   * Generates a secure HMAC-SHA256 signed session token.
   */
  private generateToken(payload: { id: string; email: string; role: string }): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days expiration
    const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  /**
   * Verifies and decodes a session token.
   */
  public verifyToken(token: string): { id: string; email: string; role: string } {
    try {
      const [header, body, signature] = token.split('.');
      if (!header || !body || !signature) {
        throw new UnauthorizedException('Invalid token format');
      }

      const expectedSignature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${header}.${body}`)
        .digest('base64url');

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        throw new UnauthorizedException('Invalid token signature');
      }

      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        throw new UnauthorizedException('Token has expired');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Authentication token is invalid or expired');
    }
  }

  /**
   * Register a new user
   */
  async signup(dto: SignupDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check if user already exists
    const existing = await (this.prisma as any).user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictException('An account with this email address already exists');
    }

    const hashedPassword = this.hashPassword(dto.password);
    const role = dto.role || 'USER';

    const user = await (this.prisma as any).user.create({
      data: {
        email: normalizedEmail,
        name: dto.name.trim(),
        password: hashedPassword,
        role: role.toUpperCase(),
      },
    });

    const token = this.generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    this.logger.log(`New user registered successfully: ${user.email} (${user.role})`);

    return {
      message: 'Account created successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  }

  /**
   * Log in an existing user
   */
  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await (this.prisma as any).user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = this.verifyPassword(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = this.generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    this.logger.log(`User logged in successfully: ${user.email}`);

    return {
      message: 'Logged in successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  }

  /**
   * Get current authenticated user profile
   */
  async getProfile(token: string) {
    const payload = this.verifyToken(token);
    const user = await (this.prisma as any).user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return user;
  }
}
