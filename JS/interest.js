export const INTEREST_OPTIONS = [
  { id: "Musik", label: "Main musik" },
  { id: "menyanyi", label: "Menyanyi" },
  { id: "menggambar", label: "Menggambar" },
  { id: "menulis", label: "Menulis" },
  { id: "membaca", label: "Membaca buku" },
  { id: "belajar", label: "Belajar" },
  { id: "fotografi", label: "Fotografi" },
  { id: "basket", label: "Basket" },
  { id: "sepakbola", label: "Futsal" },
  { id: "badminton", label: "Badminton" },
  { id: "voli", label: "Voli" },
  { id: "floorball", label: "Floorball" },
  { id: "padel", label: "Padel" },
  { id: "renang", label: "Renang" },
  { id: "gaming", label: "Gaming" },
  { id: "coding", label: "Coding" },
  { id: "robotik", label: "Robotik" },
  { id: "desain", label: "Desain grafis" },
  { id: "film", label: "Menonton film" },
  { id: "memasak", label: "Memasak" },
  { id: "traveling", label: "Traveling" },
  { id: "dance", label: "Dance" },
];

export function interestLabel(id) {
  const found = INTEREST_OPTIONS.find((o) => o.id === id);
  return found ? found.label : id;
}
