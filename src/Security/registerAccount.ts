import AccountModel from '../Model/Account_Model';
import { SecurityChallengeModel } from '../Model/SecurityChallenge_Model';
import { consumeOtpChallenge } from './otp';

type Outcome = 'ok' | 'invalid' | 'malformed' | 'conflict';

// Only the driver retries transactions/commits, according to MongoDB error labels.
export async function registerAccount(challengeId: unknown, otp: unknown): Promise<Outcome> {
    const session = await AccountModel.db.startSession();
    let outcome: Outcome = 'invalid';
    let expected: { _id: string; username: string; email: string; password: string } | undefined;
    try {
        await session.withTransaction(async () => {
            outcome = 'invalid';
            expected = undefined;
            const result = await consumeOtpChallenge(challengeId, 'registration', otp, session);
            if (result.status !== 'ok') return;
            const { username, fullname, email, passwordHash, accountId } = result.challenge;
            if (!username || !fullname || !passwordHash || !accountId) {
                outcome = 'malformed';
                return;
            }
            const existing = await AccountModel.findOne({ $or: [{ username }, { email }] })
                .session(session).select('_id').lean();
            if (existing) {
                outcome = 'conflict';
                return;
            }
            // Challenge _id already exists before any retry; no new identity is allocated.
            expected = { _id: accountId, username, email, password: passwordHash };
            await AccountModel.create([{ ...expected, fullname }], { session });
            outcome = 'ok';
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
        return outcome;
    } catch (error) {
        const failure = error as { code?: number; hasErrorLabel?: (label: string) => boolean };
        if (failure.hasErrorLabel?.('UnknownTransactionCommitResult')) {
            // Never reopen the OTP or rerun creation after an ambiguous commit.
            if (expected) {
                const account = await AccountModel.findOne(expected).read('primary')
                    .readConcern('majority').select('_id').lean();
                const challenge = await SecurityChallengeModel.findOne({
                    challengeId, purpose: 'registration', accountId: expected._id,
                    consumedAt: { $exists: true }
                }).read('primary').readConcern('majority').select('_id').lean();
                if (account && challenge) return 'ok';
            }
            console.error('Registration transaction outcome unknown; OTP state retained');
            throw error;
        }
        if (failure.code === 11000) return 'conflict';
        throw error;
    } finally {
        await session.endSession().catch(() => {
            console.error('Registration session cleanup failed');
        });
    }
}
