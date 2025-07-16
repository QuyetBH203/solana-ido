use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{
    states::pool_account::{PoolAccount, UserPurchase},
    POOL_SEED,
    USER_PURCHASE_SEED,
    instructions::create_pool::IdoError,
};

#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct ClaimTokens<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,
    
    #[account(
        seeds = [POOL_SEED, &pool_id.to_le_bytes()],
        bump = pool_account.bump
    )]
    pub pool_account: Account<'info, PoolAccount>,
    
    #[account(
        mut,
        seeds = [USER_PURCHASE_SEED, claimer.key().as_ref(), &pool_id.to_le_bytes()],
        bump = user_purchase.bump,
        constraint = user_purchase.user == claimer.key(),
        constraint = !user_purchase.has_claimed @ IdoError::AlreadyClaimed,
        constraint = user_purchase.tokens_to_claim > 0 @ IdoError::NothingToClaim
    )]
    pub user_purchase: Account<'info, UserPurchase>,
    
    #[account(
        mut,
        constraint = claimer_token_account.mint == pool_account.token_mint,
        constraint = claimer_token_account.owner == claimer.key()
    )]
    pub claimer_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = pool_token_account.mint == pool_account.token_mint
    )]
    pub pool_token_account: Account<'info, TokenAccount>,
    
    pub token_mint: Account<'info, Mint>,
    
    /// CHECK: This is the pool authority PDA
    #[account(
        seeds = [b"pool_authority", &pool_id.to_le_bytes()],
        bump
    )]
    pub pool_authority: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn process_claim_tokens(
    ctx: Context<ClaimTokens>,
    pool_id: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    let pool_account = &ctx.accounts.pool_account;
    
    // Check if claim period has started
    require!(
        clock.unix_timestamp >= pool_account.claim_time,
        IdoError::ClaimNotAvailable
    );
    
    let user_purchase = &mut ctx.accounts.user_purchase;
    let tokens_to_claim = user_purchase.tokens_to_claim;
    
    // Create seeds for PDA signing
    let pool_id_bytes = pool_id.to_le_bytes();
    let authority_seeds = &[
        b"pool_authority",
        &pool_id_bytes[..],
        &[ctx.bumps.pool_authority],
    ];
    let signer_seeds = &[&authority_seeds[..]];
    
    // Transfer IDO tokens from pool to claimer
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.pool_token_account.to_account_info(),
            to: ctx.accounts.claimer_token_account.to_account_info(),
            authority: ctx.accounts.pool_authority.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, tokens_to_claim)?;
    
    // Mark as claimed
    user_purchase.has_claimed = true;
    
    Ok(())
} 