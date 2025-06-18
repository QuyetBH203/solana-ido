use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{
    states::{config_account::ConfigAccount, pool_account::PoolAccount},
    CONFIG_SEED,
    POOL_SEED,
};

#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    
    #[account(
        seeds = [CONFIG_SEED],
        bump,
        constraint = config_account.creator == creator.key() @ IdoError::UnauthorizedCreator
    )]
    pub config_account: Account<'info, ConfigAccount>,
    
    #[account(
        init,
        payer = creator,
        space = PoolAccount::LEN,
        seeds = [POOL_SEED, &pool_id.to_le_bytes()],
        bump
    )]
    pub pool_account: Account<'info, PoolAccount>,
    
    pub currency_mint: Account<'info, Mint>, // SPL token for payment
    pub token_mint: Account<'info, Mint>,    // IDO token
    
    #[account(
        constraint = creator_token_account.mint == token_mint.key(),
        constraint = creator_token_account.owner == creator.key()
    )]
    pub creator_token_account: Account<'info, TokenAccount>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn process_create_pool(
    ctx: Context<CreatePool>,
    pool_id: u64,
    start_time: i64,
    end_time: i64,
    claim_time: i64,
    sale_amount: u64,
    price_per_token: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    
    // Validation
    require!(start_time > clock.unix_timestamp, IdoError::InvalidStartTime);
    require!(end_time > start_time, IdoError::InvalidEndTime);
    require!(claim_time >= end_time, IdoError::InvalidClaimTime);
    require!(sale_amount > 0, IdoError::InvalidSaleAmount);
    require!(price_per_token > 0, IdoError::InvalidPrice);
    
    // Check if creator has enough tokens
    require!(
        ctx.accounts.creator_token_account.amount >= sale_amount,
        IdoError::InsufficientTokenBalance
    );
    
    let pool_account = &mut ctx.accounts.pool_account;
    pool_account.pool_id = pool_id;
    pool_account.creator = ctx.accounts.creator.key();
    pool_account.start_time = start_time;
    pool_account.end_time = end_time;
    pool_account.claim_time = claim_time;
    pool_account.sale_amount = sale_amount;
    pool_account.price_per_token = price_per_token;
    pool_account.currency_mint = ctx.accounts.currency_mint.key();
    pool_account.token_mint = ctx.accounts.token_mint.key();
    pool_account.total_raised = 0;
    pool_account.is_active = true;
    pool_account.bump = ctx.bumps.pool_account;
    
    Ok(())
}

#[error_code]
pub enum IdoError {
    #[msg("Unauthorized creator")]
    UnauthorizedCreator,
    #[msg("Invalid start time")]
    InvalidStartTime,
    #[msg("Invalid end time")]
    InvalidEndTime,
    #[msg("Invalid claim time")]
    InvalidClaimTime,
    #[msg("Invalid sale amount")]
    InvalidSaleAmount,
    #[msg("Invalid price")]
    InvalidPrice,
    #[msg("Insufficient token balance")]
    InsufficientTokenBalance,
    #[msg("Sale not started")]
    SaleNotStarted,
    #[msg("Sale ended")]
    SaleEnded,
    #[msg("Pool not active")]
    PoolNotActive,
    #[msg("Insufficient payment")]
    InsufficientPayment,
    #[msg("Claim not available yet")]
    ClaimNotAvailable,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Nothing to claim")]
    NothingToClaim,
} 