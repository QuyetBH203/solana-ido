use anchor_lang::prelude::*;

pub mod instructions;
pub mod states;
pub mod constants;

pub use instructions::{ 
    initialize::*,
    create_pool::*,
    fund_pool::*,
    buy_tokens::*,
    claim_tokens::*
};
pub use states::*;
pub use constants::*;

declare_id!("CkuW9DsH4FhZwbeHV8mx26nosemXZDHYz92QJ5Nb5frM");

#[program]
pub mod solana_ido {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, owner: Pubkey, creator: Pubkey) -> Result<()> {
        process_initialize(ctx, owner, creator)
    }
    
    pub fn create_pool(
        ctx: Context<CreatePool>,
        pool_id: u64,
        start_time: i64,
        end_time: i64,
        claim_time: i64,
        sale_amount: u64,
        price_per_token: u64,
    ) -> Result<()> {
        process_create_pool(ctx, pool_id, start_time, end_time, claim_time, sale_amount, price_per_token)
    }
    
    pub fn fund_pool(
        ctx: Context<FundPool>,
        pool_id: u64,
        amount: u64,
    ) -> Result<()> {
        process_fund_pool(ctx, pool_id, amount)
    }
    
    pub fn buy_tokens(
        ctx: Context<BuyTokens>,
        pool_id: u64,
        currency_amount: u64,
    ) -> Result<()> {
        process_buy_tokens(ctx, pool_id, currency_amount)
    }
    
    pub fn claim_tokens(
        ctx: Context<ClaimTokens>,
        pool_id: u64,
    ) -> Result<()> {
        process_claim_tokens(ctx, pool_id)
    }
}
