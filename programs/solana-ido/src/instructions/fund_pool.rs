use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{
    states::pool_account::PoolAccount,
    POOL_SEED,
    instructions::create_pool::IdoError,
};

#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct FundPool<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    
    #[account(
        seeds = [POOL_SEED, &pool_id.to_le_bytes()],
        bump = pool_account.bump,
        constraint = pool_account.creator == creator.key() @ IdoError::UnauthorizedCreator
    )]
    pub pool_account: Account<'info, PoolAccount>,
    
    #[account(
        mut,
        constraint = creator_token_account.mint == pool_account.token_mint,
        constraint = creator_token_account.owner == creator.key()
    )]
    pub creator_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = pool_token_account.mint == pool_account.token_mint
    )]
    pub pool_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: This is the pool authority PDA
    #[account(
        seeds = [b"pool_authority", &pool_id.to_le_bytes()],
        bump
    )]
    pub pool_authority: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn process_fund_pool(
    ctx: Context<FundPool>,
    pool_id: u64,
    amount: u64,
) -> Result<()> {
    let pool_account = &ctx.accounts.pool_account;
    
    // Ensure the amount matches the sale amount
    require!(amount == pool_account.sale_amount, IdoError::InvalidSaleAmount);
    
    // Transfer IDO tokens from creator to pool
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.creator_token_account.to_account_info(),
            to: ctx.accounts.pool_token_account.to_account_info(),
            authority: ctx.accounts.creator.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;
    
    Ok(())
} 