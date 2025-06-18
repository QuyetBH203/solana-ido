use anchor_lang::prelude::*;

use crate::{ states::config_account::ConfigAccount, CONFIG_SEED };

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(init, payer = signer, space = ConfigAccount::LEN, seeds = [CONFIG_SEED], bump)]
    pub config_account: Account<'info, ConfigAccount>,
    // System program
    pub system_program: Program<'info, System>,
}

pub fn process_initialize(ctx: Context<Initialize>, owner: Pubkey, creator: Pubkey) -> Result<()> {
    let config_account = &mut ctx.accounts.config_account;
    config_account.owner = owner.key();
    config_account.creator = creator.key();
    Ok(())
}
