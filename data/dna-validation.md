# Tag versus measured

329 tagged tracks of 332 measured. Tempo hit = measured BPM within 2 of the tag, or an exact half/double (via alt or 2x/0.5x). Key hit = exact or relative major/minor. "alt" means the ears' second choice matched the tag (counted as a miss).

| | n | hit |
| --- | --- | --- |
| tempo | 329 | 98% (exact 320, octave 1) |
| key | 329 | 52% (exact 144, relative 26, alt-only 26) |

| tier | tempo n | tempo hit | key n | key hit |
| --- | --- | --- | --- | --- |
| slop | 22 | 100% | 22 | 55% |
| djpool | 307 | 97% | 307 | 51% |

Note: the tag BPM is also passed to hear() as bpmHint, so the tempo agreement is not independent. The DJ LIBRARY tags themselves came from an earlier automated analysis, not a human.

| track | tier | tag BPM | BPM | alt | tempo | tag key | key | key alt | conf | key |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SpongeBob SquarePants Theme Song (NEW HD) Episode Opening  | slop | 126 | 63.03 | 126.06 | octave | E minor | E minor | C major | 0.013 | exact |
| BigXthaPlug - Whip It (Clean) | djpool | 133 | 133 | 66.5 | exact | E major | E major | E minor | 0.104 | exact |
| Icona Pop ft Charli XCX - I Love It (Intro Dirty) | djpool | 126 | 126.05 | 63.02 | exact | Db major | Db major | Ab major | 0.237 | exact |
| Macklemore & Ryan Lewis ft Ray Dalton - Can't Hold Us (Dir | djpool | 144 | 143.56 | 71.78 | exact | E minor | E minor | B minor | 0.15 | exact |
| Coldplay - A Sky Full Of Stars (Clean Extended) | slop | 125 | 125.03 | 62.51 | exact | F# major | F# major | Eb minor | 0.103 | exact |
| Trippie Redd ft Playboi Carti - Miss The Rage (Intro Clean | djpool | 103 | 102.77 | 205.54 | exact | Ab major | C minor | Eb major | 0.027 | MISS |
| King Von ft Moneybagg Yo - Trust Nothing (Intro Clean) | djpool | 126 | 126.05 | 63.02 | exact | C minor | G major | B minor | 0.336 | MISS |
| ScHoolboy Q ft Kendrick Lamar - Collard Greens (Intro Clea | djpool | 154 | 154.26 | 77.13 | exact | F# major | F# minor | Db minor | 0.043 | MISS |
| Lil Nas X & Jack Harlow - INDUSTRY BABY (Intro Clean) | djpool | 150 | 149.8 | 74.9 | exact | Eb major | Eb minor | Eb major | 0.185 | alt |
| Cardi B - Bodak Yellow (Intro Dirty) | djpool | 125 | 125.03 | 62.51 | exact | E minor | E minor | B major | 0.13 | exact |
| James Hype & Miggy Dela Rosa - Ferrari (Oliver Heldens Rem | djpool | 100 | 99.93 | 199.86 | exact | Db minor | Db minor | Ab minor | 0.056 | exact |
| Troye Sivan & Kacey Musgraves ft Mark Ronson - Easy (Clean | djpool | 143 | 143.55 | 71.77 | exact | Ab major | C minor | Eb major | 0.128 | MISS |
| Beyonce - TEXAS HOLD 'EM (Clean) | djpool | 110 | 109.96 | 219.92 | exact | Bb major | D major | D minor | 0.212 | MISS |
| Stephen Marley - Chase Dem (Clean) | djpool | 131 | 131.07 | 65.53 | exact | B major | B minor | F# minor | 0.151 | MISS |
| Morgan Wallen - Bandaid On A Bullet Hole (Clean) | djpool | 155 | 155.04 | 77.52 | exact | D major | D major | B minor | 0.113 | exact |
| Kendrick Lamar - tv off (Dirty) | djpool | 101 | 100.02 | 200.04 | exact | D major | D major | B minor | 0.461 | exact |
| Owl City - FireFlies (Clean) | djpool | 180 | 180.27 | 90.13 | exact | Eb major | Eb major | C minor | 0.158 | exact |
| 24kGoldn - More Than Friends (Intro Clean) | djpool | 115 | 114.84 | 229.68 | exact | D major | G major | E minor | 0.058 | MISS |
| Rae Sremmurd - Come Get Her (Airia Twerk Remix) (Dirty) (E | djpool | 95 | 95 | 190 | exact | D minor | Bb major | D minor | 0.104 | alt |
| FutureThatsMyHoe2byGerm | djpool | 146 | 145.87 | 72.93 | exact | Eb minor | Bb major | D minor | 0.233 | MISS |
| Rae Sremmurd ft Juicy J - Powerglide (Intro Clean) | djpool | 116 | 116.13 | 232.26 | exact | B minor | B minor | D major | 0.145 | exact |
| “why are you still holding back...prove them right” Playbo | djpool | 175 | 175.18 | 87.59 | exact | E minor | G major | E minor | 0.054 | relative |
| Big Boss Vette - Pretty Girls Walk (Intro Clean) | djpool | 180 | 180.27 | 90.13 | exact | Db minor | Db minor | A major | 0.115 | exact |
| Ski Mask The Slump God - Catch Me Outside (Clean) | djpool | 112 | 112.34 | 224.68 | exact | G minor | G major | D major | 0.189 | MISS |
| Kid Cudi ft Ratatat & MGMT - Pursuit Of Happiness (Steve A | slop | 128 | 128.13 | 64.06 | exact | A minor | Ab major | F minor | 0.14 | MISS |
| Lecrae & Miles Minnick ft E-40 - The Method (Intro Clean) | djpool | 104 | 103.95 | 207.9 | exact | C major | C minor | Eb major | 0.114 | MISS |
| DJ Oggy & Malibu Joe ft Amflo, Neari & Ebene - All Togethe | djpool | 113 | 112.96 | 225.92 | exact | A minor | A minor | E minor | 0.22 | exact |
| Doses & Mimosas remix ft Vintage | djpool | 122 | 122.08 | 61.04 | exact | F minor | F major | D minor | 0.018 | MISS |
| Lil Tecca - Ransom (Intro Clean) | djpool | 120 | 120.18 | 60.09 | exact | Eb minor | Eb major | Bb major | 0.108 | MISS |
| Missy Elliot - I'm Really Hot (Intro Clean) | djpool | 114 | 114 | 228 | exact | G minor | D major | G major | 0.206 | MISS |
| Def Leppard - Pour Some Sugar On Me (Intro Clean) | djpool | 85 | 85 | 170 | exact | Db minor | Db minor | E major | 0.166 | exact |
| YG ft J. Cole & Moneybagg Yo - Scared Money (Intro Clean) | djpool | 168 | 168.06 | 84.03 | exact | Eb major | Eb major | B major | 0.235 | exact |
| Morgan Wallen - Somebody's Problem (Clean) | djpool | 137 | 136.9 | 68.45 | exact | C major | F major | D minor | 0.095 | MISS |
| Snoop Dogg, Dr. Dre, Tom Petty & Jelly Roll - Last Dance W | djpool | 86 | 86.13 | 172.26 | exact | D major | D major | E minor | 0.045 | exact |
| JUSTBEfeatJustinTimberl 2 | djpool | 71 | 73.31 | 146.62 | MISS | Db minor | Ab minor | E major | 0.024 | MISS |
| Taylor Swift - Who's Afraid of Little Old Me (Official Lyr | djpool | 180 | 180.28 | 90.14 | exact | C major | A minor | D minor | 0.088 | relative |
| Astronaut In the Ocean (BPM Supreme Slam Edit) (Clean Exte | djpool | 150 | 149.8 | 74.9 | exact | F# minor | G major | B minor | 0.06 | MISS |
| Quelle Chris - Super Fuck | djpool | 179 | 178.21 | 89.1 | exact | Eb minor | D major | Bb major | 0.087 | MISS |
| Playboi Carti - Sky (Intro Dirty) | djpool | 93 | 93.39 | 186.78 | exact | D major | D minor | A minor | 0.108 | MISS |
| Kanye West - Power (Intro Clean) | djpool | 154 | 154.26 | 77.13 | exact | G minor | G minor | D minor | 0.102 | exact |
| Shake(Prod by BallOnDaBeat) | djpool | 102 | 101.34 | 202.68 | exact | E major | E major | Db minor | 0.289 | exact |
| Kap G vs Petey Pablo - Freekin N Geekin (Kaos Super VIP 78 | djpool | 105 | 104.06 | 208.12 | exact | E major | E major | E minor | 0.036 | exact |
| A Boogie Wit Da Hoodie - Look Back At It - DJ Chino1 & Dav | djpool | 96 | 95.71 | 191.42 | exact | Eb minor | Eb minor | Bb minor | 0.199 | exact |
| Bad Bunny Y Jhay Cortez - Dakiti (Intro Dirty) | djpool | 110 | 109.96 | 219.92 | exact | E minor | E minor | A minor | 0.223 | exact |
| Machine Gun Kelly - emo girl (Intro Clean) | djpool | 165 | 164.94 | 82.47 | exact | G major | D major | B minor | 0.202 | MISS |
| Lil Wayne - Bells (Clean) | djpool | 120 | 120.18 | 60.09 | exact | Ab minor | Eb major | Ab major | 0.027 | MISS |
| GloRilla - LET HER COOK (Dirty) | djpool | 150 | 149.8 | 74.9 | exact | D minor | D minor | D major | 0.003 | exact |
| KickRaux ft Marley Waters - Wagwan (Clean) | djpool | 119 | 118.53 | 237.06 | exact | C minor | Eb major | C minor | 0.003 | relative |
| Bad Bunny - Neverita (Sergio Villanueva Remix) (Dirty Exte | djpool | 126 | 126.05 | 63.02 | exact | Eb major | Bb major | Eb major | 0.29 | alt |
| Drake ft Future & Young Thug - Way 2 Sexy (Intro Clean) | djpool | 136 | 136 | 68 | exact | E minor | E minor | C major | 0.047 | exact |
| WarOutsidefeatLexAmorby | djpool | 140 | 139.68 | 69.84 | exact | F major | F minor | F major | 0.202 | alt |
| Skip Marley ft Bob Marley - Higher Place (Clean) | djpool | 125 | 125.03 | 62.51 | exact | E minor | E minor | G major | 0.211 | exact |
| Lil Wayne ft Static Major - Lollipop (Refresh Epic Intro)  | djpool | 99 | 98.75 | 197.5 | exact | F major | D minor | A minor | 0.127 | relative |
| Ice Spice - Deli (Intro Dirty) | djpool | 140 | 139.68 | 69.84 | exact | Db major | Bb major | Bb minor | 0.185 | MISS |
| Saturday 11AM HH Ooh My Business Is To Pose (1) | djpool | 170 | 160.25 | 80.12 | MISS | E major | Ab minor | E major | 0.038 | alt |
| Diamond-Fergalicious 1 | djpool | 129 | 129.2 | 64.6 | exact | G minor | D minor | G minor | 0.039 | alt |
| Gabby Barrett - The Good Ones (Clean) | djpool | 180 | 180.27 | 90.13 | exact | D major | B minor | D major | 0.05 | relative |
| XXXTENTACION ft Ky-Mani Marley, Stefflon Don & Vybz Kartel | djpool | 125 | 124.75 | 62.37 | exact | Ab minor | Eb minor | B major | 0.036 | MISS |
| Missy Elliott - Cool Off (Intro Dirty) | djpool | 70 | 69.53 | 139.06 | exact | D minor | D major | A major | 0.271 | MISS |
| GloRilla - TGIF (R-You Slam Edit) (Dirty Extended) | djpool | 140 | 139.68 | 69.84 | exact | D minor | B major | Ab minor | 0.274 | MISS |
| Steve Miller Band - Abracadabra (Clean) | djpool | 128 | 128.13 | 64.06 | exact | A minor | A minor | E minor | 0.134 | exact |
| Ella Eyre - If I Go (Audio) | djpool | 148 | 147.66 | 73.83 | exact | F major | G minor | D minor | 0.204 | MISS |
| Jessie J ft Ariana Grande & Nicki Minaj - Bang Bang (Intro | djpool | 150 | 149.81 | 74.9 | exact | C minor | C minor | G minor | 0.045 | exact |
| Busta Rhymes - Touch It (Intro Clean) | djpool | 102 | 102.33 | 204.66 | exact | G minor | F# major | Bb minor | 0.1 | MISS |
| Willem De Roo ft Taleen - Vamos A La Playa (Clean) (Extend | slop | 128 | 128.13 | 64.06 | exact | Db minor | Db minor | E major | 0.228 | exact |
| GYALftChrisMarshallbyTr | djpool | 80 | 80.04 | 160.08 | exact | Bb minor | Bb minor | Db major | 0.14 | exact |
| Taylor Swift - 22 (Taylor's Version) (Intro Clean) | djpool | 104 | 103.95 | 207.9 | exact | G major | G major | E minor | 0.19 | exact |
| You're Welcome (Clean) | djpool | 135 | 135.11 | 67.55 | exact | C major | C major | A minor | 0.054 | exact |
| Bad Bunny - Despus de la Playa Ly (getmp3.pro) | djpool | 103 | 104.94 | 209.88 | exact | E minor | E minor | A minor | 0.157 | exact |
| Waka Waka (This Time for Africa) (Clean) | djpool | 127 | 127.08 | 63.54 | exact | E minor | D major | B minor | 0.025 | MISS |
| BigXthaPlug - Mmhmm (Dirty) | slop | 126 | 126.05 | 63.02 | exact | Bb minor | F# major | Bb minor | 0.067 | alt |
| Pio Palumbo - Flight Of The Bumblebee Nikolai Rimsky-Korsa | djpool | 160 | 160.07 | 80.03 | exact | G minor | D major | A major | 0.424 | MISS |
| Shaboozey & Myles Smith - Blink Twice (Clean) | djpool | 110 | 109.96 | 219.92 | exact | F# minor | F# minor | A major | 0.163 | exact |
| Benson Boone - Mystical Magical (Clean) | djpool | 120 | 120.18 | 60.09 | exact | F# major | Ab minor | B major | 0.159 | MISS |
| Missy Elliott - Ching A Ling (Intro Clean) | djpool | 102 | 102 | 204 | exact | Ab minor | Ab major | Eb major | 0.124 | MISS |
| Ace Of Base - Cruel Summer (Clean) | djpool | 110 | 109.96 | 219.92 | exact | Ab minor | Db minor | E major | 0.249 | MISS |
| Cent - In Da Club (Clean) | djpool | 120 | 120.18 | 60.09 | exact | Db minor | Db minor | A major | 0.013 | exact |
| Offcial The Breaking Program Mix | djpool | 112 | 111.74 | 223.48 | exact | Ab minor | Bb minor | Eb minor | 0.021 | MISS |
| Swim Good - Just Wanna Rock With You (AceMula X Stimulus R | djpool | 150 | 149.8 | 74.9 | exact | F minor | F minor | Db major | 0.078 | exact |
| Bobby Borris Pickett - Monster Mash (Clean) (Radio Edit) | djpool | 140 | 139.68 | 69.84 | exact | G major | G major | E minor | 0.232 | exact |
| Lee Brice - One Of Them Girls (Clean) | djpool | 96 | 95.71 | 191.42 | exact | E major | E major | Db minor | 0.175 | exact |
| DaBaby - PHAT (Clean) | djpool | 145 | 144.9 | 72.45 | exact | C minor | C minor | F minor | 0.19 | exact |
| Kendrick Lamar - squabble up (Dirty) | djpool | 104 | 103.95 | 207.9 | exact | F minor | F major | Db major | 0.033 | MISS |
| Webbie ft Boosie Badazz & Lil' Phat - Independent (Refresh | djpool | 174 | 173.92 | 86.96 | exact | Db minor | A major | D major | 0.169 | MISS |
| Bob Marley & The Wailers & Robin Schulz - Sun Is Shining ( | djpool | 124 | 123.89 | 61.94 | exact | G major | E minor | G major | 0.094 | relative |
| Offset - Swing My Way (Dirty) | djpool | 139 | 138.92 | 69.46 | exact | D minor | D minor | A minor | 0.316 | exact |
| Imagine Dragons - Natural (Intro Clean) | djpool | 100 | 99.94 | 199.88 | exact | D major | D minor | A minor | 0.019 | MISS |
| Jay Sean ft Lil Wayne - Down (Refresh Epic Intro) (Clean E | djpool | 132 | 132.03 | 66.01 | exact | D major | D major | B minor | 0.249 | exact |
| Megan Thee Stallion ft Flo Milli - Roc Steady (Kong The DJ | djpool | 168 | 168.06 | 84.03 | exact | F major | F major | C major | 0.275 | exact |
| Ice Spice ft NLE Choppa & DaBaby - Hannah Montana (Dirty) | djpool | 127 | 127.08 | 63.54 | exact | Db major | C minor | Ab major | 0.058 | MISS |
| Lil Boosie ft Webbie & Foxx vs GloRilla ft Sexyy Red - Wip | djpool | 167 | 166.71 | 83.35 | exact | F minor | F minor | Db major | 0.147 | exact |
| Kendrick Lamar vs FISHER & Aatig - N95 (R-You Bootleg) (Di | djpool | 127 | 127.08 | 63.54 | exact | Eb minor | B major | Eb minor | 0.096 | alt |
| Waka Floka Flame ft Roscoe Dash & Wale - No Hands (Dirty) | djpool | 132 | 131.64 | 65.82 | exact | Db minor | E major | Db minor | 0.039 | relative |
| Adventures Of Stevie V vs Fisher - Dirty Cash (Money Talks | djpool | 130 | 130.01 | 65 | exact | A minor | E major | A major | 0.124 | MISS |
| Don Omar & Nio Garcia - Se Menea (Dirty) | djpool | 180 | 180.27 | 90.13 | exact | A major | A minor | E minor | 0.205 | MISS |
| Kendrick Lamar - squabble up (Clean) | djpool | 104 | 103.95 | 207.9 | exact | F minor | F major | Db major | 0.026 | MISS |
| Hundred Waters - Show Me Love (Skrillex Remix) ft. Chance  | djpool | 130 | 130.01 | 65 | exact | B major | Ab minor | B major | 0.054 | relative |
| Russell Dickerson - Love You Like I Used To (Clean) | djpool | 152 | 152 | 76 | exact | Bb major | Bb major | G minor | 0.067 | exact |
| BobSinclarWorldHoldOnFi | slop | 127 | 127.08 | 63.54 | exact | Eb minor | Ab minor | E major | 0.023 | MISS |
| Dwayne Johnson - You're Welcome (Intro Clean) | djpool | 135 | 135.11 | 67.55 | exact | C major | C major | A minor | 0.032 | exact |
| Ziggy Marley & The Melody Makers - Give A Little Love (Cle | djpool | 119 | 118.8 | 237.6 | exact | E major | F# minor | A major | 0.039 | MISS |
| Cardi B ft Megan Thee Stallion - WAP (Intro Clean) | djpool | 133 | 133 | 66.5 | exact | B minor | Ab major | G major | 0.033 | MISS |
| Mac Miller - The Spins (Clean) | djpool | 127 | 127.08 | 63.54 | exact | A minor | A minor | C major | 0.114 | exact |
| Big Mountain - Reggae Inna Summertime (Clean) | djpool | 123 | 123.05 | 61.52 | exact | G major | G major | E minor | 0.198 | exact |
| ROSE & Bruno Mars - APT. (Refresh Epic Intro) (Clean Exten | djpool | 99 | 99.38 | 198.76 | exact | Eb major | Eb major | C minor | 0.185 | exact |
| Troye Sivan - Angel Baby (Clean) | djpool | 145 | 144.9 | 72.45 | exact | B major | Ab minor | B major | 0.08 | relative |
| Megan Thee Stallion - Girls In The Hood (Dirty) | djpool | 180 | 179.9 | 89.95 | exact | F major | F# major | F major | 0.08 | alt |
| Lil Wayne - Bells (Intro Clean) | djpool | 180 | 180.27 | 90.13 | exact | Ab minor | Ab major | Eb major | 0.061 | MISS |
| YoungBoy Never Broke Again - Right Foot Creep (Intro Clean | djpool | 105 | 105.47 | 210.94 | exact | Eb minor | Eb minor | Ab minor | 0.124 | exact |
| Nosi - So Good (Clean Radio Edit) | slop | 125 | 125.03 | 62.51 | exact | Eb minor | Eb minor | B major | 0.162 | exact |
| Something In The Orange (Instrumental) | djpool | 104 | 104.01 | 208.02 | exact | G major | E minor | G major | 0.067 | relative |
| John Summit - Thin Line (Clean Extended) | djpool | 125 | 125.03 | 62.51 | exact | G minor | Bb minor | F minor | 0.065 | MISS |
| Diplo & Julia Michaels ft Morgan Wallen - Heartless (Intro | djpool | 111 | 111.14 | 222.28 | exact | Db minor | Db minor | Ab minor | 0.114 | exact |
| Natascha Polke & PDE - Alelele (Clean Extended) | djpool | 122 | 122.08 | 61.04 | exact | G minor | G minor | Eb major | 0.187 | exact |
| Missy Elliot - One Minute Man (Cova n Mo Rada Twerk Remix) | djpool | 102 | 102 | 204 | exact | A minor | A major | E major | 0.177 | MISS |
| Endor - Pump It Up (Jax Jones Midnight Snacks Remix) (Clea | djpool | 125 | 125.03 | 62.51 | exact | F# minor | D major | F# minor | 0.016 | alt |
| Kendrick Lamar - Not Like Us (Intro Dirty) | djpool | 101 | 100.94 | 201.88 | exact | C major | G major | B minor | 0.179 | MISS |
| Thomas Rhett - Life Changes (Clean) | djpool | 176 | 176.18 | 88.09 | exact | G major | E minor | G major | 0.157 | relative |
| Gianluca Vacchi vs David Guetta ft Kid Cudi vs Benny Benas | djpool | 130 | 130.01 | 65 | exact | Bb minor | Bb minor | F minor | 0.167 | exact |
| Oliver Heldens & Becky Hill - Gecko (Overdrive) (Ed Marqui | djpool | 128 | 128.13 | 64.06 | exact | G minor | G minor | D minor | 0.2 | exact |
| Marley Waters ft Culan - Higher Place (Dirty) | djpool | 131 | 130.83 | 65.41 | exact | F minor | F minor | C minor | 0.145 | exact |
| Go To Work (feat. Chef Boy) (Radio Edit) 1 | djpool | 116 | 116.13 | 232.26 | exact | D minor | D major | Bb major | 0.194 | MISS |
| Cardi B ft Megan Thee Stallion - WAP (Intro Dirty) | djpool | 133 | 133 | 66.5 | exact | B minor | G major | Ab major | 0.064 | MISS |
| Nardo Wick - Dah Dah DahDah (Intro Clean) | djpool | 112 | 112.34 | 224.68 | exact | Eb major | Eb minor | Eb major | 0.038 | alt |
| Nostalgix - Show Me Love (Clean Extended) | djpool | 138 | 137.82 | 68.91 | exact | A minor | D minor | F major | 0.174 | MISS |
| Benson Boone - Mystical Magical (DJ Bruce Acapella Break)  | djpool | 120 | 120.18 | 60.09 | exact | F# major | Ab minor | Eb minor | 0.154 | MISS |
| Lil Boosie ft Webbie & Foxx vs GloRilla ft Sexyy Red - Wip | djpool | 167 | 166.71 | 83.35 | exact | F minor | F minor | Db major | 0.293 | exact |
| BadBunnyMONACObyBadBunn | djpool | 139 | 138.92 | 69.46 | exact | Db minor | E minor | B minor | 0 | MISS |
| Travis Scott ft Playboi Carti & Sheck Wes - FE!N (Intro Di | djpool | 148 | 147.66 | 73.83 | exact | Eb minor | Eb minor | F# major | 0.217 | exact |
| Stevie Wonder - Superstition (Clean) | djpool | 97 | 97.05 | 194.1 | exact | Eb major | Eb minor | Eb major | 0.188 | alt |
| DjBron - 69 Boyz Tootsie Roll Set It Off Mix | djpool | 132 | 132.03 | 66.01 | exact | F# minor | Eb minor | F# major | 0.06 | MISS |
| USHER & Burna Boy - Coming Home (Dirty) | djpool | 110 | 109.96 | 219.92 | exact | C major | A minor | C major | 0.103 | relative |
| Bad Bunny - TE DESEO LO MEJOR (Sergio Villanueva Remix) (C | djpool | 126 | 126.05 | 63.02 | exact | Ab minor | Db major | F# major | 0.157 | MISS |
| Selena - Amor Prohibido (Intro Clean) | djpool | 180 | 179.76 | 89.88 | exact | G major | G major | E minor | 0.126 | exact |
| Missy Elliott - Ching A Ling (Clean) | djpool | 102 | 102 | 204 | exact | Ab minor | Ab major | Eb major | 0.138 | MISS |
| Tiesto - The Business (Clean Radio Edit) | djpool | 120 | 120.18 | 60.09 | exact | G minor | Ab minor | E major | 0.207 | MISS |
| Ying Yang Twins ft Pitbull - Shake (Steve1der Zumba Socks  | djpool | 128 | 128.13 | 64.06 | exact | F# minor | G major | D major | 0.165 | MISS |
| Drake ft Kanye West - Glow (Intro Clean) | djpool | 162 | 161.5 | 80.75 | exact | D minor | D minor | A minor | 0.159 | exact |
| Kendrick Lamar ft Dody6 - hey now (Dirty) | djpool | 102 | 102 | 204 | exact | C minor | C major | A minor | 0.042 | MISS |
| Sabrina Carpenter - Espresso (Intro Clean) | djpool | 104 | 103.95 | 207.9 | exact | G major | A minor | E minor | 0.185 | MISS |
| BrainStewKnowGoodFlipby | djpool | 75 | 74.9 | 149.8 | exact | F minor | Db major | F minor | 0.088 | alt |
| Don Toliver - No Pole (Intro Dirty) | slop | 128 | 128.13 | 64.06 | exact | F major | C minor | F minor | 0.273 | MISS |
| Anitta - Loco (Intro Dirty) | djpool | 139 | 138.74 | 69.37 | exact | A minor | A minor | E minor | 0.049 | exact |
| The Weeknd vs FISHER & ARCO - Can't Feel My Face (Rivas 'O | slop | 128 | 128.13 | 64.06 | exact | A minor | A minor | D minor | 0.207 | exact |
| Shaboozey - A Bar Song (Tipsy) (Dirty) | djpool | 162 | 161.5 | 80.75 | exact | A major | A major | F# minor | 0.068 | exact |
| All The Small Things (Two Friends Remix) (Clean Extended) | djpool | 127 | 127.08 | 63.54 | exact | C major | C major | A minor | 0.199 | exact |
| Missy Elliott - Cool Off (BERGE Jersey Club Remix) (Clean  | djpool | 143 | 143.55 | 71.77 | exact | D minor | D major | A major | 0.172 | MISS |
| Yo Gotti & Mike Will Made It ft Nicki Minaj - Rake It Up ( | djpool | 150 | 149.8 | 74.9 | exact | Db minor | Db minor | Db major | 0.4 | exact |
| Drake - NOKIA (Intro Clean) | djpool | 126 | 126.05 | 63.02 | exact | G minor | D minor | F major | 0.072 | MISS |
| EssencefeatTemsbyWizKid | djpool | 138 | 138.43 | 69.21 | exact | E minor | E minor | A minor | 0.074 | exact |
| Joseph SoMo - Buy U A Drank (T-Pain Cover) | djpool | 120 | 106.78 | 213.56 | MISS | G major | G major | E minor | 0.121 | exact |
| GloRilla ft Sexyy Red vs Lil Boosie ft Webbie & Foxx - WHA | djpool | 111 | 111.38 | 222.76 | exact | F minor | F minor | Db major | 0.139 | exact |
| First Act ( Group Performance ) The Breaking Program | djpool | 103 | 111.54 | 223.08 | MISS | Ab minor | Eb major | Ab major | 0.016 | MISS |
| Bob Marley & The Wailers - You Can't Blame The Youth (Clea | djpool | 156 | 155.93 | 77.96 | exact | D major | D major | B minor | 0.307 | exact |
| Shaboozey - A Bar Song (Tipsy) (GSEPP Remix) (Dirty Extend | djpool | 127 | 127.08 | 63.54 | exact | F# minor | F# minor | A major | 0.016 | exact |
| DJ TAJ - WORK (JERSEY CLUB REMIX)-1 | djpool | 140 | 139.68 | 69.84 | exact | Db major | B major | Ab minor | 0.096 | MISS |
| Pogohm-RunwithPollux | slop | 160 | 160.07 | 80.03 | exact | Ab minor | Eb major | Ab major | 0.175 | MISS |
| Ladii Rose ft Zoey Brinxx - DIP (Intro Clean) | djpool | 139 | 138.92 | 69.46 | exact | G major | G major | C major | 0.222 | exact |
| Glorilla - TGIF (MNX Remix) (Dirty Extended) | djpool | 132 | 132.03 | 66.01 | exact | G minor | G major | E minor | 0.07 | MISS |
| Just [The Tip] [Dirty] | djpool | 176 | 176.18 | 88.09 | exact | Ab major | Bb minor | F minor | 0.099 | MISS |
| Billie Eilish - bad guy (Intro Clean) | djpool | 135 | 135.01 | 67.5 | exact | G major | G minor | D minor | 0.221 | MISS |
| Mouf by Lil Sammy | djpool | 80 | 80.03 | 160.06 | exact | Eb major | B major | E major | 0.133 | MISS |
| Iggy Azalea - Work (Intro Clean) | djpool | 140 | 139.68 | 69.84 | exact | G minor | G major | E minor | 0.221 | MISS |
| 24kGoldn - More Than Friends (Clean) | djpool | 172 | 172.26 | 86.13 | exact | D major | G major | E minor | 0.063 | MISS |
| JVSTINclandestinaTikTok | djpool | 86 | 86.13 | 172.26 | exact | A major | D major | B minor | 0.102 | MISS |
| Fashionista-Brooke | djpool | 128 | 128.13 | 64.06 | exact | F minor | F minor | F major | 0.162 | exact |
| SOCOFTTERRISPOTLESSCEEZ | djpool | 98 | 97.88 | 195.76 | exact | Eb major | Ab major | F minor | 0.091 | MISS |
| Coi Leray - Players (Clean) | djpool | 105 | 104.94 | 209.88 | exact | F# minor | Ab major | Db minor | 0.116 | MISS |
| Ice Spice - Think U The Shit (Fart) (Dirty) | djpool | 122 | 122.08 | 61.04 | exact | E minor | C major | A minor | 0.231 | MISS |
| EyezOnMeftNinaSkybyTroy | djpool | 97 | 97.05 | 194.1 | exact | E minor | E minor | B minor | 0.145 | exact |
| PeoplebyLibianca | djpool | 99 | 98.91 | 197.82 | exact | Ab major | Bb minor | Db major | 0.165 | MISS |
| T.I. - 24's (Clean) | djpool | 162 | 161.5 | 80.75 | exact | F minor | F minor | Db major | 0.156 | exact |
| Warren Zevon - Werewolves Of London (2007 Remastered Versi | djpool | 103 | 103.36 | 206.72 | exact | G major | G major | E minor | 0.423 | exact |
| USHERATownGirlfeatLatto | djpool | 140 | 139.68 | 69.84 | exact | E major | E major | Db minor | 0.17 | exact |
| Nicki Minaj - Barbie Tingz (Clean) | djpool | 137 | 136.02 | 68.01 | exact | E minor | E minor | C major | 0.346 | exact |
| TOASTFeatKoffeeProdbyIz | djpool | 133 | 133.37 | 66.68 | exact | F minor | Bb minor | F minor | 0.066 | alt |
| Ziggy Marley ft Ben Harper - Play With Sky (Clean) | djpool | 140 | 139.68 | 69.84 | exact | E major | E major | Db minor | 0.328 | exact |
| you merely adopted the dark, i was born in it (tiktok vers | djpool | 118 | 118.12 | 236.24 | exact | Db minor | A major | Db major | 0.016 | MISS |
| Timmy Trumpet & 3 Are Legend - Country Roads (Clean Short  | djpool | 160 | 160.07 | 80.03 | exact | A major | A major | F# minor | 0.06 | exact |
| Coi Leray - Players (Dirty) | djpool | 105 | 104.94 | 209.88 | exact | F# minor | Ab major | Db minor | 0.104 | MISS |
| Selena Gomez ft Marshmello - Wolves (Intro Clean) | djpool | 125 | 125.03 | 62.51 | exact | D major | B minor | D major | 0.271 | relative |
| Skip Marley ft H.E.R. - Slow Down (Dennis Blaze Hold Yuh B | djpool | 102 | 102 | 204 | exact | Ab major | Ab major | F minor | 0.108 | exact |
| Troye Sivan - Got Me Started (Bag Raiders Remix) (Dirty Ex | djpool | 89 | 89.11 | 178.22 | exact | G minor | G minor | Bb major | 0.104 | exact |
| El Alfa vs Pat Benatar - 4k vs Hit Me With Your Best Shot  | djpool | 163 | 161.5 | 80.75 | exact | Eb major | E major | B major | 0.047 | MISS |
| NARUTO - OST - Main - Theme - Trap - Remix | djpool | 97 | 96.6 | 193.2 | exact | A minor | A minor | E minor | 0.18 | exact |
| Nicki Minaj ft Lil Baby - Bussin (Intro Clean) | djpool | 140 | 139.68 | 69.84 | exact | Eb minor | Eb minor | Eb major | 0.191 | exact |
| lightyears | djpool | 146 | 145.87 | 72.93 | exact | Db minor | Eb minor | F# major | 0.013 | MISS |
| George Kranz - Din Daa Daa (Clean) (Radio Edit) | djpool | 124 | 123.89 | 61.94 | exact | F# minor | F# major | F minor | 0.16 | MISS |
| Talent Forum 2019 Adult HH - Rescue Mission | djpool | 100 | 100.35 | 200.7 | exact | Ab minor | G major | E minor | 0.398 | MISS |
| Jack Harlow ft Chris Brown - Already Best Friends (Dennis  | djpool | 103 | 103.36 | 206.72 | exact | Bb minor | Eb minor | Bb minor | 0.055 | alt |
| Tyler, The Creator - Sticky (Clean) | djpool | 157 | 159.5 | 79.75 | MISS | Eb minor | B major | Eb minor | 0.097 | alt |
| GloRilla ft Sexyy Red - WHATCHU KNO ABOUT ME (Dirty) | djpool | 167 | 166.71 | 83.35 | exact | F minor | F minor | Db major | 0.015 | exact |
| Sunday Mornin (FINAL) | djpool | 110 | 109.96 | 219.92 | exact | A major | B minor | E minor | 0.213 | MISS |
| LOCKITUPfeatYeatmidwxst | djpool | 123 | 123.05 | 61.52 | exact | C major | B minor | G major | 0.025 | MISS |
| Nicki Minaj ft Lil Uzi Vert - Everybody (Clean) | djpool | 138 | 137.82 | 68.91 | exact | F minor | F major | A minor | 0.033 | MISS |
| Troye Sivan ft PinkPantheress & Hyunjin Of Stray Kids - Ru | djpool | 168 | 168.06 | 84.03 | exact | G minor | C minor | Eb major | 0.031 | MISS |
| Missy Elliot - I'm Really Hot (Clean) | djpool | 114 | 114 | 228 | exact | G minor | D major | G major | 0.11 | MISS |
| Sticky (getmp3.pro) | djpool | 157 | 159.51 | 79.75 | MISS | Eb major | B major | Eb minor | 0.109 | MISS |
| Remy Ma - Conceited (There's Something About Remy) (Clean) | djpool | 100 | 100.02 | 200.04 | exact | Eb minor | B major | Eb minor | 0.065 | alt |
| USHERATownGirlfeatLatto 2 | djpool | 140 | 139.68 | 69.84 | exact | E major | E major | Db minor | 0.17 | exact |
| Bad Bunny ft El Alfa - La Romana (Intro Dirty) | djpool | 126 | 126.05 | 63.02 | exact | E major | A minor | C major | 0.069 | MISS |
| All Squad - The Pump Up 2018 | djpool | 116 | 112.35 | 224.7 | MISS | G minor | Bb major | G minor | 0.188 | relative |
| Wyclef Jean ft John Forte & Pras - We Trying To Stay Alive | djpool | 99 | 99.38 | 198.76 | exact | F minor | F minor | Bb minor | 0.096 | exact |
| Kendrick Lamar - tv off (Clean) | djpool | 100 | 100.02 | 200.04 | exact | D major | D major | B minor | 0.471 | exact |
| Charli XCX ft Billie Eilish vs FISHER - Guess (R-You Bootl | djpool | 130 | 130.01 | 65 | exact | E minor | A minor | D minor | 0.021 | MISS |
| Jack Harlow ft Chris Brown - Already Best Friends (Dennis  | djpool | 103 | 103.36 | 206.72 | exact | Bb minor | Eb minor | Bb minor | 0.052 | alt |
| David Guetta & Bebe Rexha - I'm Good (Blue) (Clean Extende | slop | 128 | 128.13 | 64.06 | exact | G minor | G minor | D minor | 0.341 | exact |
| Chainz ft Lil Wayne - Presha (Intro Clean) | djpool | 151 | 150.89 | 75.44 | exact | C minor | G major | C minor | 0.258 | alt |
| Lil Wayne - King Carter (Clean) | djpool | 114 | 114 | 228 | exact | F# minor | F# minor | A major | 0.144 | exact |
| Azealia Banks ft Lazy Jay - 212 [Dirty] | djpool | 126 | 126.05 | 63.02 | exact | G minor | F# major | Eb minor | 0.245 | MISS |
| Lecrae & Andy Mineo - Coming In Hot (Intro Clean) | djpool | 140 | 139.68 | 69.84 | exact | Eb major | Eb major | B major | 0.022 | exact |
| HurtinMebystefflondon | djpool | 136 | 136 | 68 | exact | C major | A minor | C major | 0.092 | relative |
| Big Wild - 6's to 9's (feat. Rationale) | djpool | 96 | 95.7 | 191.4 | exact | Ab major | Eb major | F minor | 0.179 | MISS |
| Dr. Dre ft Jill Scott & Jon Connor - For The Love Of Money | djpool | 101 | 100.68 | 201.36 | exact | Eb minor | Bb minor | Eb minor | 0.156 | alt |
| LETITGOfeatJustinBieber | djpool | 129 | 129.2 | 64.6 | exact | F minor | Ab major | F minor | 0.123 | relative |
| Teriyaki Boyz - Tokyo Drift (Refresh Guaracha Drums Bootle | djpool | 130 | 130.01 | 65 | exact | G minor | F# major | Eb minor | 0.039 | MISS |
| Raining Tacos - Parry Gripp & BooneBum | djpool | 138 | 137.82 | 68.91 | exact | Eb major | Eb major | C minor | 0.227 | exact |
| Years 1 | djpool | 101 | 100.94 | 201.88 | exact | E minor | G major | E minor | 0.104 | relative |
| GloRilla - TGIF (R-You Slam Edit) (Clean Extended) | djpool | 140 | 139.68 | 69.84 | exact | D minor | B major | Ab minor | 0.263 | MISS |
| Kendrick Lamar - Humble. (Intro Clean) | djpool | 150 | 149.8 | 74.9 | exact | Db major | Db major | A major | 0.414 | exact |
| Hanumankind & Kalmi - Big Dawgs (Clean) | djpool | 180 | 180.27 | 90.13 | exact | E minor | E major | E minor | 0.088 | alt |
| $, Kanye West & Ty Dolla $ign ft Rich The Kid & Playboi Ca | djpool | 148 | 147.66 | 73.83 | exact | F minor | Db major | F minor | 0.206 | alt |
| Art Of Noise - Moments In Love (Clean) | djpool | 69 | 68.91 | 137.82 | exact | Ab minor | Db minor | E major | 0.034 | MISS |
| Annie Lennox vs Queen - No More Pressure | djpool | 120 | 120.18 | 60.09 | exact | Eb major | Eb major | C minor | 0.294 | exact |
| Nicki Minaj - Super Freaky Girl (Muzik Junkies Remix) (Dir | djpool | 133 | 133 | 66.5 | exact | Ab minor | D major | G minor | 0.12 | MISS |
| Lee Brice - Rumor (Clean) | djpool | 141 | 140.95 | 70.47 | exact | A major | A major | F# minor | 0.069 | exact |
| Taylor Swift - Love Story (Taylor's Version) (Intro Clean) | djpool | 123 | 123.05 | 61.52 | exact | B minor | B minor | D major | 0.141 | exact |
| Anitta, Cardi B Y Myke Towers - Me Gusta (Intro Dirty) | djpool | 110 | 109.96 | 219.92 | exact | F# minor | F# minor | B minor | 0.078 | exact |
| Late London vs John Summit & Hayla - Hoes In My Station vs | slop | 128 | 128.13 | 64.06 | exact | E major | E minor | A minor | 0.233 | MISS |
| Katy Perry ft Juicy J - Dark Horse (Intro Clean) | djpool | 132 | 132.03 | 66.01 | exact | Bb minor | Bb minor | F# major | 0.212 | exact |
| Dustin Lynch - I'd Be Jealous Too (Clean) | djpool | 101 | 101.04 | 202.08 | exact | C major | A minor | D minor | 0.032 | relative |
| Ice Spice - Deli (Intro Clean) | djpool | 140 | 139.68 | 69.84 | exact | Db major | Bb major | Bb minor | 0.194 | MISS |
| Travis Scott ft Playboi Carti - FE!N (Clean) | djpool | 148 | 147.66 | 73.83 | exact | Eb minor | Eb minor | F# major | 0.285 | exact |
| The Jacksons - Can You Feel It (Remix) 2014 | djpool | 126 | 124.74 | 62.37 | exact | F# major | D major | F# minor | 0.136 | MISS |
| LISA - MONEY -Clean - Lyrics | djpool | 140 | 139.68 | 69.84 | exact | E minor | E minor | E major | 0.304 | exact |
| Solee - Pink Panther (Clean) (Short Edit) | djpool | 123 | 123.05 | 61.52 | exact | Ab minor | G major | Ab major | 0.071 | MISS |
| BOOM Homecoming 2018-19 INTRO | djpool | 129 | 129.19 | 64.59 | exact | C major | A minor | C major | 0.201 | relative |
| Playboi Carti - Magnolia (Intro Clean) | djpool | 163 | 162.95 | 81.47 | exact | E minor | B minor | B major | 0.096 | MISS |
| Waka Flocka Flame ft Kebo Gotti - Grove St. Party (Dirty) | djpool | 140 | 139.68 | 69.84 | exact | D minor | Bb major | G minor | 0.118 | MISS |
| Missy Elliott - Cool Off (BERGE Jersey Club Remix) (Dirty  | djpool | 143 | 143.55 | 71.77 | exact | D minor | A major | D major | 0.02 | MISS |
| Jay Z vs DJ Snake - Hard Knock Life (LOCZI Show Edit) (Cle | djpool | 154 | 153.81 | 76.9 | exact | F major | F major | C major | 0.146 | exact |
| Thundercat - Funny Thing | djpool | 70 | 69.84 | 139.68 | exact | G major | E minor | D major | 0.075 | relative |
| Anyma - Beautiful (with Joji) (Cegor Extended Remix) | slop | 172 | 172.27 | 86.13 | exact | Eb minor | F# major | Ab minor | 0.07 | relative |
| Busta Rhymes - Touch It (Clean) | djpool | 102 | 102.33 | 204.66 | exact | G minor | F# major | Bb minor | 0.053 | MISS |
| Lady Gaga - Bloody Mary (Disco Fries & Clinton Sparks Remi | slop | 128 | 128.13 | 64.06 | exact | E minor | E minor | C major | 0.088 | exact |
| Dev vs Fisher - In The Dark (Cesar Castilla 'Losing It' Ma | slop | 127 | 127.08 | 63.54 | exact | G minor | G major | Eb major | 0.048 | MISS |
| Taylor Swift - We Are Never Ever Getting Back Together (Ta | djpool | 172 | 172.26 | 86.13 | exact | G minor | G major | E minor | 0.137 | MISS |
| Morgan Wallen ft Florida Georgia Line - Up Down (Intro Cle | djpool | 130 | 130.01 | 65 | exact | F# major | F# major | Eb minor | 0.13 | exact |
| Ying Yang Twins ft Pitbull - Shake (BPM Supreme Jump Off E | djpool | 118 | 118.12 | 236.24 | exact | Bb minor | G major | A minor | 0.13 | MISS |
| Lil Tecca - Ransom (BPM Supreme 70-90 Transition) (Clean E | djpool | 90 | 89.99 | 179.98 | exact | Eb minor | Eb major | Bb major | 0.176 | MISS |
| Polo G - Bad Man (Smooth Criminal) (Intro Clean) | djpool | 120 | 120.18 | 60.09 | exact | F major | A minor | C major | 0.135 | MISS |
| Cardi B, Bad Bunny & J Balvin - I Like It (Dillon Francis  | djpool | 150 | 149.8 | 74.9 | exact | F major | F major | F minor | 0.25 | exact |
| Fisher - Losing It (Muzik Junkies Break Intro) (Clean) | slop | 125 | 125.03 | 62.51 | exact | G minor | G major | D major | 0.118 | MISS |
| Selena Gomez Y Rauw Alejandro - Baila Conmigo (Intro Clean | djpool | 150 | 149.8 | 74.9 | exact | D minor | D minor | F major | 0.212 | exact |
| Lil Boosie ft Webbie & Foxx - Wipe Me Down (Clean) | djpool | 165 | 164.94 | 82.47 | exact | F minor | F minor | F major | 0.143 | exact |
| Drake ft Sexyy Red & SZA - Rich Baby Daddy (Intro Dirty) | djpool | 146 | 145.87 | 72.93 | exact | D major | D major | B minor | 0.042 | exact |
| Taylor Swift - Anti-Hero (Intro Clean) | djpool | 97 | 96.9 | 193.8 | exact | E major | Db minor | F# minor | 0.087 | relative |
| Ariana Grande - Baby I (Cesar Castilla Slam Intro) (Clean  | djpool | 102 | 102 | 204 | exact | F minor | Bb minor | Db major | 0.05 | MISS |
| GloRilla - Yeah Glo! (Clean) | djpool | 99 | 98.75 | 197.5 | exact | C major | C major | A minor | 0.088 | exact |
| Bob Marley - Sun Is Shining (Hawkins Remix) (Clean Radio E | djpool | 130 | 130.01 | 65 | exact | F# major | F# major | Eb minor | 0.105 | exact |
| God Only Knows 1 | djpool | 96 | 95.71 | 191.42 | exact | D major | B minor | D major | 0.005 | relative |
| DariusRuckerWagonWheelR 2 | djpool | 100 | 99.93 | 199.86 | exact | A major | A major | F# minor | 0.172 | exact |
| Brett Young - Lady (Clean) | djpool | 170 | 170 | 85 | exact | G major | G major | E minor | 0.057 | exact |
| Shouse - Love Tonight (Cesar Castilla Bootleg) (Clean Exte | slop | 126 | 126.05 | 63.02 | exact | C minor | C minor | C major | 0.012 | exact |
| Wale, Cool & Dre & J Cole - Poke It Out (Clean) | djpool | 99 | 99.11 | 198.22 | exact | Eb major | Eb major | Ab major | 0.1 | exact |
| Fireboy DML - change your life (Intro Clean) | djpool | 100 | 99.93 | 199.86 | exact | B major | E minor | B minor | 0.063 | MISS |
| Talent Forum HH Beg 4pm | djpool | 125 | 125.03 | 62.51 | exact | D major | G major | G minor | 0.026 | MISS |
| Sabrina Carpenter - Espresso (Dirty) | djpool | 104 | 103.95 | 207.9 | exact | G major | A minor | E minor | 0.143 | MISS |
| John Summit & Hayla & Cassian vs Darude - Shiver (Rivas 'S | slop | 127 | 127.08 | 63.54 | exact | E minor | E minor | B minor | 0.267 | exact |
| Yeah Supa Remix | djpool | 105 | 104.93 | 209.86 | exact | Ab minor | E minor | C major | 0.097 | MISS |
| Bob Marley & The Wailers - Coming In From The Cold (Clean) | djpool | 143 | 143.55 | 71.77 | exact | C major | C major | A minor | 0.206 | exact |
| Problems - The Prodigy Remix (INSTRUMENTAL) | djpool | 100 | 99.93 | 199.86 | exact | E major | E major | Db minor | 0.359 | exact |
| Adele - Rolling In The Deep (DJ Kash Amapiano Remix) (Clea | djpool | 113 | 112.96 | 225.92 | exact | C minor | C minor | Eb major | 0.176 | exact |
| Rema & Selena Gomez - Calm Down (Intro Clean) | djpool | 143 | 142.57 | 71.28 | exact | B major | B major | Ab minor | 0.097 | exact |
| JUSTBEfeatJustinTimberl | djpool | 71 | 73.31 | 146.62 | MISS | Db minor | Ab minor | E major | 0.024 | MISS |
| Tiwa Savage - Mega Money Mega (Intro Clean) | djpool | 153 | 153.13 | 76.56 | exact | Db minor | Db minor | F# minor | 0.013 | exact |
| Bob Marley - Jamming (FISHER Remix) (Clean Extended) | djpool | 126 | 126.05 | 63.02 | exact | B minor | B minor | D major | 0.296 | exact |
| Sexyy Red vs Lil Wayne - SkeeYee (R-You Jump Off Edit) (Di | djpool | 110 | 109.96 | 219.92 | exact | F minor | F minor | Db major | 0.067 | exact |
| IMPACT - 2017 Final | djpool | 98 | 97.97 | 195.94 | exact | A minor | F major | A minor | 0.076 | alt |
| T.I. - 24's (Intro Clean) | djpool | 162 | 161.5 | 80.75 | exact | F minor | F minor | Db major | 0.174 | exact |
| BLP Kosher - Dreidel Bop Official (getmp3.pro) | djpool | 175 | 175.18 | 87.59 | exact | C minor | G minor | Eb major | 0.033 | MISS |
| Jay-Z - Hard Knock Life (Ghetto Anthem) (Instrumental) | djpool | 154 | 153.81 | 76.9 | exact | E minor | E minor | A minor | 0.09 | exact |
| Offset - Swing My Way (Muzik Junkies Break Intro) (Dirty E | djpool | 140 | 139.68 | 69.84 | exact | D minor | D minor | A minor | 0.327 | exact |
| Jay-Z - Hard Knock Life (Ghetto Anthem) (Clean) | djpool | 154 | 153.81 | 76.9 | exact | E minor | E minor | A minor | 0.124 | exact |
| GloRilla ft Sexyy Red vs Lil Boosie ft Webbie & Foxx - WHA | djpool | 111 | 111.38 | 222.76 | exact | F minor | F minor | Db major | 0.149 | exact |
| The Weeknd - Sacrifice (John Summit Remix) (Clean Extended | slop | 125 | 125.03 | 62.51 | exact | B minor | B minor | E minor | 0.379 | exact |
| Burna Boy - Bundle By Bundle (Intro Dirty) | djpool | 93 | 92.7 | 185.4 | exact | E minor | B minor | D major | 0.13 | MISS |
| Playboi Carti ft Lil Uzi Vert - Shoota (Intro Clean) | djpool | 153 | 153.12 | 76.56 | exact | Db minor | Db minor | A major | 0.034 | exact |
| Chainz ft Lil Wayne - Presha (Clean) | djpool | 151 | 150.89 | 75.44 | exact | C minor | G major | C minor | 0.25 | alt |
| Myles Smith - Stargazing Lyric Vid (getmp3.pro) | djpool | 124 | 123.89 | 61.94 | exact | E major | E major | Db minor | 0.165 | exact |
| Zaytoven ft Gucci Mane & 21 Savage - East Atlanta Day (Int | djpool | 150 | 149.8 | 74.9 | exact | Db minor | A major | Db minor | 0.083 | alt |
| La Roux vs John Summit & venbee & Odd Mob - Bulletproof (R | djpool | 132 | 132.02 | 66.01 | exact | Eb major | Eb minor | Eb major | 0.224 | alt |
| Taylor Swift - Midnight Rain (Intro Clean) | djpool | 175 | 174.6 | 87.3 | exact | C major | C major | A minor | 0.102 | exact |
| TAKEITOFFbyFISHER | slop | 127 | 127.08 | 63.54 | exact | Eb minor | Eb major | B major | 0.009 | MISS |
| Drake - No Friends In The Industry (Intro Clean) | djpool | 167 | 167.48 | 83.74 | exact | D major | D minor | Bb major | 0.265 | MISS |
| Kanye West vs FISHER (OZ) - Love Lockdown (R-You Bootleg)  | djpool | 127 | 127.08 | 63.54 | exact | F# minor | F# minor | Db minor | 0.002 | exact |
| Missy Elliott - Cool Off (R-You Acapella In) (Dirty Extend | djpool | 70 | 69.53 | 139.06 | exact | D minor | D major | A major | 0.262 | MISS |
| A Boogie Wit Da Hoodie ft 6IX9INE - Swervin (Clean) | djpool | 124 | 123.89 | 61.94 | exact | D major | D major | B minor | 0.029 | exact |
| Missy Elliott - Pass That Dutch (Clean) | djpool | 111 | 111.14 | 222.28 | exact | A major | A major | F# minor | 0.112 | exact |
| x Espuppy - Hello | djpool | 133 | 133.37 | 66.68 | exact | C major | E minor | G major | 0.112 | MISS |
| NEIKED ft MAE MULLER & POLO G - Better Days (Intro Clean) | djpool | 110 | 109.96 | 219.92 | exact | Bb major | G minor | Bb major | 0.06 | relative |
| Bad Bunny - Moscow Mule (AROCK Remix) (Clean Radio Edit) | djpool | 122 | 122.08 | 61.04 | exact | F minor | F minor | Ab major | 0.095 | exact |
| UnchangingLovebyMavado | djpool | 155 | 155.04 | 77.52 | exact | G major | A minor | D minor | 0.031 | MISS |
| Mystical Magical - Benson Boone Lyrics | djpool | 120 | 120.18 | 60.09 | exact | F# major | Ab minor | Eb minor | 0.168 | MISS |
| Wale, Cool & Dre & J Cole - Poke It Out (Intro Clean) | djpool | 99 | 99.38 | 198.76 | exact | Eb major | Eb major | Ab major | 0.04 | exact |
| Taylor Swift - I Knew You Were Trouble (George Acosta Boot | slop | 128 | 128.13 | 64.06 | exact | Eb minor | Eb minor | F# major | 0.242 | exact |
| GloRilla ft Sexyy Red vs T.I. - WHATCHU KNO ABOUT ME (Anth | djpool | 167 | 166.71 | 83.35 | exact | F minor | F minor | Db major | 0.042 | exact |
| Talent Forum HH5 | djpool | 91 | 90.66 | 181.32 | exact | Db minor | Ab major | A major | 0.152 | MISS |
| Luke Bryan - Prayin' In A Deer Stand (Intro Clean) | djpool | 105 | 105.47 | 210.94 | exact | D major | D major | E minor | 0.126 | exact |
| Mac Miller - The Spins (getmp3.pro) | djpool | 127 | 127.08 | 63.54 | exact | A minor | A minor | C major | 0.128 | exact |
| PAIDbyKanyeWest | djpool | 120 | 120.18 | 60.09 | exact | Eb minor | Bb minor | Db major | 0.189 | MISS |
| The Weeknd ft Tyler, The Creator - Here We Go...Again (Int | djpool | 136 | 135.11 | 67.55 | exact | Bb minor | Bb minor | Db major | 0.045 | exact |
| Kendrick Lamar - Not Like Us (Clean) | djpool | 101 | 100.94 | 201.88 | exact | C major | G major | D major | 0.118 | MISS |
| Bad Bunny - Ojitos Lindos (Sergio Villanueva Remix) (Clean | djpool | 84 | 84.03 | 168.06 | exact | Ab minor | Eb minor | F# major | 0.034 | MISS |
| Technotronic & DJ Luiz Claudio - Pump Up The Jam (Hugo Can | slop | 125 | 125.03 | 62.51 | exact | C major | C minor | G minor | 0.054 | MISS |
| GloRilla ft Sexyy Red - WHATCHU KNO ABOUT ME (Clean) | djpool | 167 | 166.71 | 83.35 | exact | F minor | F minor | Db major | 0.012 | exact |
| Drake ft Sexyy Red & SZA - Rich Baby Daddy (Clean) | djpool | 146 | 145.87 | 72.93 | exact | D major | D major | B minor | 0.004 | exact |
| LongStoryShortby2Chainz | djpool | 137 | 136.9 | 68.45 | exact | D major | E minor | G major | 0.122 | MISS |
| Lil Uzi Vert - Just Wanna Rock (Intro Clean) | djpool | 150 | 150.23 | 75.11 | exact | Eb minor | Bb major | Bb minor | 0.045 | MISS |
| Kendrick Lamar ft AzChike & Dody6 - peekaboo (Dirty) | djpool | 100 | 99.94 | 199.88 | exact | C minor | C minor | Ab major | 0.059 | exact |
| T.I. - 24's (Instrumental) | djpool | 162 | 161.5 | 80.75 | exact | F minor | F minor | Db major | 0.216 | exact |
| NEIKED ft MAE MULLER & POLO G - Better Days (Clean) | djpool | 110 | 109.96 | 219.92 | exact | Bb major | G minor | Bb major | 0.028 | relative |
| Keri Hilson - Pretty Girl Rock (Clean) | djpool | 160 | 160.07 | 80.03 | exact | D major | B minor | D major | 0.045 | relative |
| Kanye West ft Baby Keem & Travis Scott - Praise God (Clean | djpool | 118 | 117.92 | 235.84 | exact | Db minor | Db minor | A major | 0.027 | exact |
| Naruto - Blue Bird Trap Remix | djpool | 98 | 97.97 | 195.94 | exact | F# minor | F# minor | D major | 0.187 | exact |
| Billie Eilish - bad guy (Clean) | djpool | 135 | 135.02 | 67.51 | exact | G major | G minor | C minor | 0.151 | MISS |
| Shaboozey - A Bar Song (Tipsy) (Clean) | djpool | 162 | 161.5 | 80.75 | exact | A major | A major | F# minor | 0.066 | exact |
| El Alfa, CJ Y Chael Produciendo ft El Cherry Scom - La Mam | djpool | 130 | 130.01 | 65 | exact | Db major | Ab major | C major | 0.079 | MISS |
| Ziggy Marley & The Melody Makers - Power To Move Ya (Clean | djpool | 97 | 96.9 | 193.8 | exact | A minor | A minor | D minor | 0.222 | exact |
