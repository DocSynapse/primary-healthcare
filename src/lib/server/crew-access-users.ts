import "server-only";

interface CrewUser {
  username: string;
  password: string;
  displayName: string;
}

export const CREW_USERS: CrewUser[] = [
  { username: "ferdi-balowerti", password: "Balowerti#8", displayName: "Ferdi Balowerti" },
  { username: "ferdi", password: "fer123456", displayName: "dr. Ferdi Iskandar" },
  { username: "joseph", password: "jos123456", displayName: "Joseph Arianto" },
  { username: "cahyo", password: "cah123456", displayName: "Tri Cahyo" },
  { username: "efildan", password: "efi123456", displayName: "Efildan" },
];
