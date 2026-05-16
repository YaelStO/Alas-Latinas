#![no_std]
extern crate alloc;
use alloc::format;
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, String, Vec, symbol_short, Symbol,
};

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReservationStatus {
    Pending,
    Confirmed,
    Completed,
    Refunded,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reservation {
    pub reservation_id: u64,
    pub traveler: Address,
    pub package_id: u64,
    pub price: i128,
    pub deposit: i128,
    pub status: ReservationStatus,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TravelPackage {
    pub package_id: u64,
    pub destination: String,
    pub price: i128,
    pub capacity: u32,
    pub available: u32,
    pub deposit_percent: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LoyaltyToken {
    pub user: Address,
    pub balance: i128,
}

#[contract]
pub struct TourismContract;

const RESERVATION_COUNTER: Symbol = symbol_short!("RES_CNT");
const PACKAGE_COUNTER: Symbol = symbol_short!("PKG_CNT");
const ADMIN: Symbol = symbol_short!("ADMIN");

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Loyalty(Address),
}

#[contractimpl]
impl TourismContract {
    pub fn init(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&RESERVATION_COUNTER, &0u64);
        env.storage().instance().set(&PACKAGE_COUNTER, &0u64);
    }

    pub fn create_package(
        env: Env,
        destination: String,
        price: i128,
        capacity: u32,
        deposit_percent: u32,
    ) -> u64 {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();

        let mut counter: u64 = env.storage().instance().get(&PACKAGE_COUNTER).unwrap();
        counter += 1;

        let package = TravelPackage {
            package_id: counter,
            destination,
            price,
            capacity,
            available: capacity,
            deposit_percent,
        };

        env.storage().persistent().set(&package_key(&env, counter), &package);
        env.storage().instance().set(&PACKAGE_COUNTER, &counter);
        counter
    }

    pub fn get_package(env: Env, package_id: u64) -> Option<TravelPackage> {
        env.storage().persistent().get(&package_key(&env, package_id))
    }

    pub fn create_reservation(
        env: Env,
        traveler: Address,
        package_id: u64,
    ) -> u64 {
        traveler.require_auth();

        let package: TravelPackage = env
            .storage()
            .persistent()
            .get(&package_key(&env, package_id))
            .expect("Package not found");

        if package.available == 0 {
            panic!("No available slots");
        }

        let deposit = (package.price * package.deposit_percent as i128) / 100;

        let mut counter: u64 = env.storage().instance().get(&RESERVATION_COUNTER).unwrap();
        counter += 1;

        let reservation = Reservation {
            reservation_id: counter,
            traveler: traveler.clone(),
            package_id,
            price: package.price,
            deposit,
            status: ReservationStatus::Pending,
            created_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&reservation_key(&env, counter), &reservation);

        let mut updated_package = package;
        updated_package.available -= 1;
        env.storage()
            .persistent()
            .set(&package_key(&env, package_id), &updated_package);

        env.storage().instance().set(&RESERVATION_COUNTER, &counter);

        counter
    }

    pub fn get_reservation(env: Env, reservation_id: u64) -> Option<Reservation> {
        env.storage().persistent().get(&reservation_key(&env, reservation_id))
    }

    pub fn confirm_service(env: Env, reservation_id: u64) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();

        let mut reservation: Reservation = env
            .storage()
            .persistent()
            .get(&reservation_key(&env, reservation_id))
            .expect("Reservation not found");

        if reservation.status != ReservationStatus::Confirmed {
            panic!("Reservation must be confirmed first");
        }

        reservation.status = ReservationStatus::Completed;
        env.storage()
            .persistent()
            .set(&reservation_key(&env, reservation_id), &reservation);

        Self::add_loyalty_points(env, reservation.traveler.clone(), 10);
    }

    pub fn confirm_payment(env: Env, reservation_id: u64) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();

        let mut reservation: Reservation = env
            .storage()
            .persistent()
            .get(&reservation_key(&env, reservation_id))
            .expect("Reservation not found");

        if reservation.status != ReservationStatus::Pending {
            panic!("Reservation is not pending");
        }

        reservation.status = ReservationStatus::Confirmed;
        env.storage()
            .persistent()
            .set(&reservation_key(&env, reservation_id), &reservation);
    }

    pub fn process_refund(env: Env, reservation_id: u64) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();

        let mut reservation: Reservation = env
            .storage()
            .persistent()
            .get(&reservation_key(&env, reservation_id))
            .expect("Reservation not found");

        if reservation.status == ReservationStatus::Completed {
            panic!("Cannot refund completed reservation");
        }

        let package: TravelPackage = env
            .storage()
            .persistent()
            .get(&package_key(&env, reservation.package_id))
            .expect("Package not found");

        let mut updated_package = package;
        updated_package.available += 1;
        env.storage()
            .persistent()
            .set(&package_key(&env, reservation.package_id), &updated_package);

        reservation.status = ReservationStatus::Refunded;
        env.storage()
            .persistent()
            .set(&reservation_key(&env, reservation_id), &reservation);
    }

    pub fn cancel_reservation(env: Env, reservation_id: u64) {
        let mut reservation: Reservation = env
            .storage()
            .persistent()
            .get(&reservation_key(&env, reservation_id))
            .expect("Reservation not found");

        reservation.traveler.require_auth();

        if reservation.status != ReservationStatus::Pending {
            panic!("Can only cancel pending reservations");
        }

        let package: TravelPackage = env
            .storage()
            .persistent()
            .get(&package_key(&env, reservation.package_id))
            .expect("Package not found");

        let mut updated_package = package;
        updated_package.available += 1;
        env.storage()
            .persistent()
            .set(&package_key(&env, reservation.package_id), &updated_package);

        reservation.status = ReservationStatus::Cancelled;
        env.storage()
            .persistent()
            .set(&reservation_key(&env, reservation_id), &reservation);
    }

    pub fn get_loyalty_balance(env: Env, user: Address) -> i128 {
        let key = DataKey::Loyalty(user.clone());
        match env.storage().persistent().get::<DataKey, i128>(&key) {
            Some(balance) => balance,
            None => 0,
        }
    }

    pub fn get_reservations_by_user(env: Env, user: Address) -> Vec<Reservation> {
        let mut result = Vec::new(&env);
        let counter: u64 = env.storage().instance().get(&RESERVATION_COUNTER).unwrap_or(0);

        for i in 1..=counter {
            if let Some(reservation) =
                env.storage().persistent().get::<Symbol, Reservation>(&reservation_key(&env, i))
            {
                if reservation.traveler == user {
                    result.push_back(reservation);
                }
            }
        }
        result
    }

    fn add_loyalty_points(env: Env, user: Address, points: i128) {
        let key = DataKey::Loyalty(user);
        let current = match env.storage().persistent().get::<DataKey, i128>(&key) {
            Some(balance) => balance,
            None => 0,
        };
        env.storage().persistent().set(&key, &(current + points));
    }
}

fn reservation_key(env: &Env, id: u64) -> Symbol {
    let s = format!("RES_{id}");
    Symbol::new(env, &s)
}

fn package_key(env: &Env, id: u64) -> Symbol {
    let s = format!("PKG_{id}");
    Symbol::new(env, &s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    fn setup() -> (Env, Address, Address) {
        let env = Env::default();
        let admin = Address::generate(&env);
        let traveler = Address::generate(&env);
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TourismContract);
        env.as_contract(&contract_id, || {
            TourismContract::init(env.clone(), admin.clone());
        });
        (env, admin, traveler)
    }

    fn create_client<'a>(env: &'a Env, contract_id: &'a Address) -> TourismContractClient<'a> {
        TourismContractClient::new(env, contract_id)
    }

    #[test]
    fn test_init_and_create_package() {
        let env = Env::default();
        let admin = Address::generate(&env);
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TourismContract);
        let client = create_client(&env, &contract_id);

        client.init(&admin);

        let dest = String::from_str(&env, "Cancun");
        let pkg_id = client.create_package(&dest, &1000, &50, &20);
        assert_eq!(pkg_id, 1);

        let pkg = client.get_package(&1).unwrap();
        assert_eq!(pkg.price, 1000);
        assert_eq!(pkg.capacity, 50);
        assert_eq!(pkg.available, 50);
    }

    #[test]
    fn test_create_reservation() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let traveler = Address::generate(&env);
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TourismContract);
        let client = create_client(&env, &contract_id);

        client.init(&admin);

        let dest = String::from_str(&env, "Cancun");
        client.create_package(&dest, &1000, &50, &20);

        let res_id = client.create_reservation(&traveler, &1);
        assert_eq!(res_id, 1);

        let res = client.get_reservation(&1).unwrap();
        assert_eq!(res.price, 1000);
        assert_eq!(res.deposit, 200);
        assert_eq!(res.status, ReservationStatus::Pending);

        let pkg = client.get_package(&1).unwrap();
        assert_eq!(pkg.available, 49);
    }

    #[test]
    fn test_confirm_and_complete() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let traveler = Address::generate(&env);
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TourismContract);
        let client = create_client(&env, &contract_id);

        client.init(&admin);

        let dest = String::from_str(&env, "Cancun");
        client.create_package(&dest, &1000, &50, &20);
        client.create_reservation(&traveler, &1);

        client.confirm_payment(&1);
        let res = client.get_reservation(&1).unwrap();
        assert_eq!(res.status, ReservationStatus::Confirmed);

        client.confirm_service(&1);
        let res = client.get_reservation(&1).unwrap();
        assert_eq!(res.status, ReservationStatus::Completed);

        let loyalty = client.get_loyalty_balance(&traveler);
        assert_eq!(loyalty, 10);
    }

    #[test]
    fn test_refund() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let traveler = Address::generate(&env);
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TourismContract);
        let client = create_client(&env, &contract_id);

        client.init(&admin);

        let dest = String::from_str(&env, "Cancun");
        client.create_package(&dest, &1000, &50, &20);
        client.create_reservation(&traveler, &1);

        client.process_refund(&1);

        let res = client.get_reservation(&1).unwrap();
        assert_eq!(res.status, ReservationStatus::Refunded);

        let pkg = client.get_package(&1).unwrap();
        assert_eq!(pkg.available, 50);
    }

    #[test]
    fn test_cancel_reservation() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let traveler = Address::generate(&env);
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TourismContract);
        let client = create_client(&env, &contract_id);

        client.init(&admin);

        let dest = String::from_str(&env, "Cancun");
        client.create_package(&dest, &1000, &50, &20);
        client.create_reservation(&traveler, &1);

        client.cancel_reservation(&1);

        let res = client.get_reservation(&1).unwrap();
        assert_eq!(res.status, ReservationStatus::Cancelled);

        let pkg = client.get_package(&1).unwrap();
        assert_eq!(pkg.available, 50);
    }
}
