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
pub struct BuyTokens<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    #[account(
        mut,
        seeds = [POOL_SEED, &pool_id.to_le_bytes()],
        bump = pool_account.bump,
        constraint = pool_account.is_active @ IdoError::PoolNotActive
    )]
    pub pool_account: Account<'info, PoolAccount>,
    
    #[account(
        init_if_needed,
        payer = buyer,
        space = UserPurchase::LEN,
        seeds = [USER_PURCHASE_SEED, buyer.key().as_ref(), &pool_id.to_le_bytes()],
        bump
    )]
    pub user_purchase: Account<'info, UserPurchase>,
    
    #[account(
        mut,
        constraint = buyer_currency_account.mint == pool_account.currency_mint,
        constraint = buyer_currency_account.owner == buyer.key()
    )]
    pub buyer_currency_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = pool_currency_account.mint == pool_account.currency_mint
    )]
    pub pool_currency_account: Account<'info, TokenAccount>,
    
    pub currency_mint: Account<'info, Mint>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn process_buy_tokens(
    ctx: Context<BuyTokens>,
    pool_id: u64,
    currency_amount: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    let pool_account = &mut ctx.accounts.pool_account;
    
    // Check if sale is active
    require!(
        clock.unix_timestamp >= pool_account.start_time,
        IdoError::SaleNotStarted
    );
    require!(
        clock.unix_timestamp <= pool_account.end_time,
        IdoError::SaleEnded
    );
    
    // Calculate tokens to receive
    let tokens_to_receive = currency_amount
        .checked_div(pool_account.price_per_token)
        .ok_or(IdoError::InvalidPrice)?;
    
    require!(tokens_to_receive > 0, IdoError::InsufficientPayment);
    
    // Check if enough tokens are available for sale
    let remaining_tokens = pool_account.sale_amount
        .checked_sub(pool_account.total_raised.checked_div(pool_account.price_per_token).unwrap_or(0))
        .ok_or(IdoError::InsufficientTokenBalance)?;
    
    require!(tokens_to_receive <= remaining_tokens, IdoError::InsufficientTokenBalance);
    
    // Transfer currency tokens from buyer to pool
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.buyer_currency_account.to_account_info(),
            to: ctx.accounts.pool_currency_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, currency_amount)?;
    
    // Update pool account
    pool_account.total_raised = pool_account.total_raised
        .checked_add(currency_amount)
        .ok_or(IdoError::InvalidPrice)?;
    
    // Update user purchase
    let user_purchase = &mut ctx.accounts.user_purchase;
    if user_purchase.user == Pubkey::default() {
        // First time purchase
        user_purchase.user = ctx.accounts.buyer.key();
        user_purchase.pool_id = pool_id;
        user_purchase.amount_purchased = currency_amount;
        user_purchase.tokens_to_claim = tokens_to_receive;
        user_purchase.has_claimed = false;
        user_purchase.bump = ctx.bumps.user_purchase;
    } else {
        // Additional purchase
        user_purchase.amount_purchased = user_purchase.amount_purchased
            .checked_add(currency_amount)
            .ok_or(IdoError::InvalidPrice)?;
        user_purchase.tokens_to_claim = user_purchase.tokens_to_claim
            .checked_add(tokens_to_receive)
            .ok_or(IdoError::InvalidPrice)?;
    }
    
    Ok(())
} 