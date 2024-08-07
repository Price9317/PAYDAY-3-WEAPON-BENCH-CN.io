// Effective Armour Penetration is the amount of damage dealt through armour
// based on the weapon's armour penetration and the enemy's armour hardness
function effectiveArmorPenetration(
    armorPenetration,
    armorHardness
) {
    // Armour penetrating damage is calculated with AP - AH + 1
    // Clamp Effective Armour Penetration between 0 and 1
    return Math.max(0, Math.min(1, armorPenetration - armorHardness + 1));
}

function shotsToKill(
    damage,
    critMultiplier,
    effectiveArmorPenetration,
    enemyHealth,
    enemyArmor) {
    if (critMultiplier < 1){ critMultiplier = 1;}

    const critDamage = damage * critMultiplier,
          APDamage = damage * effectiveArmorPenetration,
          critAPDamage = critDamage * effectiveArmorPenetration;
		  if (selectedSkills.includes('Expose') && enemyArmor !== 3500 && enemyArmor > 50){
		enemyArmor = 0;
	}
    const shotsOnArmor = Math.min(
        Math.ceil(enemyArmor / damage),
        Math.ceil(enemyHealth / critAPDamage)
    );
    const remainingHealth = Math.max(0, Math.floor(enemyHealth - (critAPDamage * shotsOnArmor)));
    const shotsOnHealth = Math.ceil(remainingHealth / critDamage);

    if (critMultiplier > 1) {
        // Calculate how many crits can be replaced
        // based on damage left over after the kill
        const overdamage = critDamage - (remainingHealth % critDamage || critDamage);
        const replacableCrits = Math.min(
            shotsOnHealth,
            Math.floor(overdamage / (critDamage - damage))
        );
        
        // Calculate how many crits through armour can be replaced
        // based on extra health after replacing crits
        //
        // If the enemy dies from armour penetrating shots,
        // use the damage left over after the kill instead
        const armorOverdamage =
            overdamage - (replacableCrits * (critDamage - damage)) ||
            critAPDamage - (enemyHealth % critAPDamage || critAPDamage);
        const replacableArmoredCrits = Math.min(
            shotsOnArmor,
            Math.floor(armorOverdamage / (critAPDamage - APDamage) || shotsOnArmor)
        );

        return {
            armoredCrits: shotsOnArmor - replacableArmoredCrits,
            armoredNonCrits: replacableArmoredCrits,
            unarmoredCrits: shotsOnHealth - replacableCrits,
            unarmoredNonCrits: replacableCrits,
            totalShots: shotsOnArmor + shotsOnHealth
        }
    }
    return {
        armoredCrits: 0,
        armoredNonCrits: shotsOnArmor,
        unarmoredCrits: 0,
        unarmoredNonCrits: shotsOnHealth,
        totalShots: shotsOnArmor + shotsOnHealth
    }
}

// Returns the shots to kill at each unique distance
function weaponShotsToKill(
    weaponName,
    enemyName,
    selectedSkills
) {
    const weapon = weaponData[weaponName],
          enemy = enemyData[enemyName];

    // Create a new array of distances
    // based on the distance arrays in a weapon's stats
    // ordered from highest to lowest
    const distanceArray = [... new Set([
        ...weapon.DamageDistanceArray.map(dist => dist.Distance),
        ...weapon.CriticalDamageMultiplierDistanceArray.map(dist => dist.Distance),
        500 // Add 5m distance for Face to Face
    ])].sort((a, b) => b - a);

    let damageMultiplier = 1,
        armorPenetrationModifier = 0;

    if (!weapon.ArmorPenetration) weapon.ArmorPenetration = 0;

    // Apply damage and AP buffs from skills
    if (selectedSkills.includes('edge'))
        damageMultiplier += skills.edge.damageMultiplier;
    if (selectedSkills.includes('coupdegrace') && enemyName !== '防爆特警')
        damageMultiplier += skills.coupdegrace.damageMultiplier;
    if (selectedSkills.includes('combatmarking'))
        damageMultiplier += skills.combatmarking.damageMultiplier;
    if (selectedSkills.includes('painasymbolia'))
        damageMultiplier += skills.painasymbolia.damageMultiplier;
    if (selectedSkills.includes('highgrain'))
        armorPenetrationModifier += skills.highgrain.armorPenetrationModifier;
    
    const EAP = effectiveArmorPenetration(
            weapon.ArmorPenetration + armorPenetrationModifier,
            enemy.ArmorHardness
          );

    let shotsAtDistances = {},
        previous = {};

    distanceArray.forEach(distance => {
        const damage = (weapon.DamageDistanceArray.find(i => i.Distance >= distance) ??
                  weapon.DamageDistanceArray.slice(-1)[0]).Damage;
        
        let multiplier = (weapon.CriticalDamageMultiplierDistanceArray.find(i => i.Distance >= distance) ??
                weapon.CriticalDamageMultiplierDistanceArray.slice(-1)[0]).Multiplier;
        
        if (!selectedSkills.includes('headshot')) multiplier = 1;
        if (selectedSkills.includes('headshot') && selectedSkills.includes('longshot'))
            multiplier = weapon.CriticalDamageMultiplierDistanceArray[0].Multiplier;
        if (enemyName == '无人机') multiplier = 1;
        if (distance <= 500 && selectedSkills.includes('facetoface'))
            damageMultiplier += skills.facetoface.damageMultiplier;

        const weaponShotsToKill = shotsToKill(
            damage * damageMultiplier,
            multiplier,
            EAP,
            enemy.Health,
            // If headshots are enabled assume the dozer's face is unarmoured
            enemyName == '防爆特警' && selectedSkills.includes('headshot') ?
                0 :
                enemy.Armor
        );

        // Calculation only includes headshots if headshots are enabled
        if (enemyName == '防爆特警' && selectedSkills.includes('headshot')) {
            weaponShotsToKill.unarmoredCrits += weaponShotsToKill.unarmoredNonCrits;
            weaponShotsToKill.unarmoredNonCrits = 0;
        }
        
        // Remove duplicates
        if (
            previous &&
            weaponShotsToKill.armoredCrits != previous.armoredCrits ||
            weaponShotsToKill.armoredNonCrits != previous.armoredNonCrits ||
            weaponShotsToKill.unarmoredCrits != previous.unarmoredCrits ||
            weaponShotsToKill.unarmoredNonCrits != previous.unarmoredNonCrits
        ) shotsAtDistances[distance] = weaponShotsToKill;
        previous = weaponShotsToKill;
    });

    return shotsAtDistances;
}

function timeToKill(
    shotsToKill,
    roundsPerMinute,
    pelletCount,
    magSize,
    reloadTime
) {
    select = document.getElementById("Magazine-selector");
    Magtype = select.selectedIndex;
    //console.log(select[Magtype].value)
    //console.log(reloadTime)
    switch(select[Magtype].value){
        case "快拔":
            reloadTime = reloadTime * 0.85;
            break;
        case "紧凑":
            reloadTime = reloadTime * 0.95;
            break;
        case "扩容":
            reloadTime = reloadTime * 1.1;
            break;
    }
    //console.log(reloadTime)
    if (!roundsPerMinute) roundsPerMinute = 600;
    if (!pelletCount) pelletCount = 1;
    else shotsToKill = Math.ceil(shotsToKill / pelletCount);

    let TTK = (shotsToKill - 1) / (roundsPerMinute / 60);
    if (reloadTime && magSize && shotsToKill > magSize)
        TTK += reloadTime * Math.floor(shotsToKill / magSize);

    return Math.round(TTK * 100) / 100;
}



function initialiseWeaponData() {
    // Create a list of weapons organised by their class
    let weaponList = {};
    for (const weapon in weaponData) {
        const weaponClass = weaponData[weapon].Class
        weaponList[weaponClass] = weaponList[weaponClass] || [];
        weaponList[weaponClass].push(weapon)
    }

    // Populate the weapon selector separated by class
    const weaponSelector = document.querySelector('#weapon-selector');
    for (const weaponClass in weaponList) {
        const weaponSelectorGroup = weaponSelector.appendChild(document.createElement('optgroup'));
        weaponSelectorGroup.setAttribute('label', weaponClass);
		
        
        weaponList[weaponClass].forEach((weapon) => {
            const weaponSelectorOption = weaponSelector.appendChild(document.createElement('option'));
            weaponSelectorOption.setAttribute('value', weapon);
            weaponSelectorOption.textContent = weapon;
        });
    }

    Object.keys(skills).forEach(skill => {
        const weaponSkillButton = document.querySelector('#weapon-skills')
            .appendChild(document.createElement('button'));
        weaponSkillButton.setAttribute('type', 'button');
        weaponSkillButton.setAttribute('value', skill);
        weaponSkillButton.setAttribute('class', 'weapon-skill glass tooltip-wrapper');
        weaponSkillButton.setAttribute('aria-pressed', 'false');

        // Disable buttons for skills that require edge
        if (edgeSkills.includes(skill))
            weaponSkillButton.setAttribute('disabled', '');

        const weaponSkillIcon = weaponSkillButton.appendChild(document.createElement('img'));
        weaponSkillIcon.setAttribute('src', 'images/skills/' + skill + '.png');
        weaponSkillIcon.setAttribute('alt', skill);

        const weaponSkillTooltip = weaponSkillButton.appendChild(document.createElement('div'));
        weaponSkillTooltip.setAttribute('class', 'tooltip');
        
        const tooltipTitle = weaponSkillTooltip.appendChild(document.createElement('span'));
        tooltipTitle.setAttribute('class', 'tooltip-title');
        tooltipTitle.textContent = skills[skill].name;

        const tooltipBody = weaponSkillTooltip.appendChild(document.createElement('p'));
        tooltipBody.setAttribute('class', 'tooltip-body');
        tooltipBody.innerHTML = edgeSkills.includes(skill) ?
            '需要锋锐。<br/>' + skills[skill].description :
            skills[skill].description;
    });
	
}

function updateDamageData(
    selectedWeapon,
    selectedSkills,
    
) {

    const damageChart = document.querySelector('#damage-data');
    
    damageChart.textContent = '';
    var MagSizenum = document.getElementById("weapon-mag-size-stat").innerText;
    //console.log(MagSizenum)
    let currentCard = 0;

    for (const enemyName in enemyData) {
        const shotsAtDistances = weaponShotsToKill(
                  selectedWeapon,
                  enemyName,
                  selectedSkills
              ),
              armorPenetration = weaponData[selectedWeapon].ArmorPenetration
                + (selectedSkills.includes('highgrain') ? skills.highgrain.armorPenetrationModifier : 0),
              EAP = effectiveArmorPenetration(
                  armorPenetration,
                  enemyData[enemyName].ArmorHardness
              );

        let damageStats = document.createElement('div');
        damageStats.setAttribute('class', 'damage-stats-card card');
        damageChart.appendChild(damageStats);
    
        let statDisplay = document.createElement('div');
        statDisplay.setAttribute('class', 'damage-stats');
        damageStats.appendChild(statDisplay);

        // If the enemy is a dozer or a shield and headshot is enabled
        // display the shots required and TTK to break their visor
        if (
            (enemyName == '防爆特警' || enemyName == '盾牌特警') &&
            selectedSkills.includes('headshot')
        ) {
            let visorDisplay = document.createElement('p');
            visorDisplay.setAttribute('class', 'visor-damage glass');
            
            let damage = weaponData[selectedWeapon].DamageDistanceArray[0].Damage,
                damageMultiplier = 1,
                distance = weaponData[selectedWeapon].DamageDistanceArray[0].Distance / 100;

            const visorArmorHardness = enemyData[enemyName].VisorArmorHardness;

            if (armorPenetration > visorArmorHardness - 1) {
                visorDisplay.innerHTML = `子弹可以穿透观察窗`;
            } else {
                visorDisplay.setAttribute('class', 'visor-damage glass cracked');

                if (selectedSkills.includes('edge'))
                    damageMultiplier += skills.edge.damageMultiplier;
                if (selectedSkills.includes('facetoface')) {
                    damageMultiplier += skills.facetoface.damageMultiplier;
                    distance = 5;
                }
                if (selectedSkills.includes('combatmarking'))
                    damageMultiplier += skills.combatmarking.damageMultiplier;
                if (selectedSkills.includes('painasymbolia'))
                    damageMultiplier += skills.painasymbolia.damageMultiplier;

    
                let shotsToBreakVisor = Math.ceil(
                        enemyData[enemyName].VisorArmor / (damage * damageMultiplier)
                    ),
                    timeToBreakVisor = timeToKill(
                        shotsToBreakVisor,
                        weaponData[selectedWeapon].RoundsPerMinute,
                        weaponData[selectedWeapon].ProjectilesPerFiredRound,
                        MagSizenum,
                        weaponData[selectedWeapon].ReloadEmptyNotifyTime
                    );

                
                if (weaponData[selectedWeapon].ProjectilesPerFiredRound > 1) {
                    shotsToBreakVisor = Math.ceil(shotsToBreakVisor / weaponData[selectedWeapon].ProjectilesPerFiredRound);
                }

                const reloadCount = Math.floor((shotsToBreakVisor - 1) / (MagSizenum));
               if (enemyName == '盾牌特警') {
                    visorDisplay.textContent = `${distance}米内的${shotsToBreakVisor}次射击方可打破观察窗`;
                }
               if (enemyName == '防爆特警') {
                    visorDisplay.textContent = `${distance}米内的${shotsToBreakVisor}次射击方可打破护目镜`;
                }
                let visorDisplayTTK = document.createElement('span')
                visorDisplayTTK.setAttribute('class', 'time-to-kill');
                visorDisplayTTK.textContent += `${timeToBreakVisor} 秒, `
                visorDisplayTTK.textContent += `需要 ${reloadCount} ${reloadCount != 1 ? '次装填' : '次装填'}`
                visorDisplay.appendChild(visorDisplayTTK);
            }
            damageStats.appendChild(visorDisplay);
        }

        // Populate the damage chart with weapon name and equipped skills
        let damageStatsWeapon = document.createElement('div');
        damageStatsWeapon.setAttribute('class', 'damage-stats-weapon');

        let damageStatsWeaponName = document.createElement('h2');
        damageStatsWeaponName.setAttribute('class', 'weapon-name');
        damageStatsWeaponName.textContent = selectedWeapon;
        damageStatsWeapon.appendChild(damageStatsWeaponName);

        if (selectedSkills) {
            let damageStatsWeaponSkills = document.createElement('div');
            damageStatsWeaponSkills.setAttribute('class', 'weapon-skills');
            selectedSkills.forEach(skill => {
                let weaponSkillBadge = document.createElement('span');
                weaponSkillBadge.setAttribute('class', 'weapon-skill');
                weaponSkillBadge.setAttribute('aria-pressed', 'true');
    
                if ((!EAP ||
                    !enemyData[enemyName].ArmorHardness) &&
                    skill == 'highgrain'
                ) weaponSkillBadge.setAttribute('disabled', '');
    
                if (enemyName == '防爆特警' &&
                    skill == 'coupdegrace'
                ) weaponSkillBadge.setAttribute('disabled', '');
                if (enemyName == '防爆特警' &&skill == 'Expose') weaponSkillBadge.setAttribute('disabled', '');
				if (enemyName == '狙击手' &&skill == 'Expose') weaponSkillBadge.setAttribute('disabled', '');
				if (enemyName == '幻影特工' &&skill == 'Expose') weaponSkillBadge.setAttribute('disabled', '');
				if (enemyName == '无人机' &&skill == 'Expose') weaponSkillBadge.setAttribute('disabled', '');
                let weaponSkillIcon = document.createElement('img');
                weaponSkillIcon.setAttribute('src', './images/skills/' + skill + '.png');
                weaponSkillIcon.setAttribute('alt', skill);
                weaponSkillBadge.appendChild(weaponSkillIcon);
    
                damageStatsWeaponSkills.appendChild(weaponSkillBadge);
            });
    
            damageStatsWeapon.appendChild(damageStatsWeaponSkills);
            statDisplay.appendChild(damageStatsWeapon);
        }

        let damageBracketContainer = document.createElement('div');
        damageBracketContainer.setAttribute('class', 'damage-bracket-container');
        statDisplay.appendChild(damageBracketContainer);

        // Populate the damage chart with shots to kill at different distances
        const damageBracketCount = 3;
        for (let i = 0; i < damageBracketCount; i++) {
            const distance = Object.keys(shotsAtDistances)[i];
            if (!distance) break;

            const TTK = timeToKill(
                      shotsAtDistances[distance].totalShots,
                      weaponData[selectedWeapon].RoundsPerMinute,
                      weaponData[selectedWeapon].ProjectilesPerFiredRound,
                      MagSizenum,
                      weaponData[selectedWeapon].ReloadEmptyNotifyTime
                  ),
                  armoredCrits = shotsAtDistances[distance].armoredCrits,
                  armoredNonCrits = shotsAtDistances[distance].armoredNonCrits,
                  unarmoredCrits = shotsAtDistances[distance].unarmoredCrits,
                  unarmoredNonCrits = shotsAtDistances[distance].unarmoredNonCrits;
            
            let totalShotsToKill = shotsAtDistances[distance].totalShots;

            if (weaponData[selectedWeapon].ProjectilesPerFiredRound > 1) {
                totalShotsToKill = Math.ceil(shotsAtDistances[distance].totalShots / weaponData[selectedWeapon].ProjectilesPerFiredRound);
            }

            let damageBracket = document.createElement('div');
            damageBracket.setAttribute('class', 'damage-bracket');
            
            damageBracketContainer.appendChild(damageBracket);

            let damageBracketDistance = document.createElement('h2')
            damageBracketDistance.setAttribute('class', 'distance');
            damageBracketDistance.textContent = distance / 100 + " 米";
            damageBracket.appendChild(damageBracketDistance);

            let damageBracketShots = document.createElement('h1')
            damageBracketShots.setAttribute('class', 'shots-to-kill');
            damageBracketShots.textContent = totalShotsToKill + (totalShotsToKill != 1 ? ' 发' : ' 发');
            damageBracket.appendChild(damageBracketShots);

            if (armoredCrits || armoredNonCrits) {
                let damageBracketArmored = document.createElement('span');
                if (EAP) {
                    damageBracketArmored.setAttribute('class', 'enemy-armor penetrating-armored-shots');
                } else {
                    damageBracketArmored.setAttribute('class', 'enemy-armor');
                }

                let shotsText = [];
                if (armoredCrits) shotsText.push(armoredCrits + (armoredCrits != 1 ? ' crits' : ' crit'));
                if (armoredNonCrits) shotsText.push(armoredNonCrits + ' body');
                damageBracketArmored.textContent = shotsText.join(' + ');
                damageBracket.appendChild(damageBracketArmored);
            }
            if (unarmoredCrits || unarmoredNonCrits) {
                let damageBracketUnarmored = document.createElement('span')
                damageBracketUnarmored.setAttribute('class', 'enemy-health');
                let shotsText = [];
                if (unarmoredCrits) shotsText.push(unarmoredCrits + (unarmoredCrits != 1 ? ' crits' : ' crit'));
                if (unarmoredNonCrits) shotsText.push(unarmoredNonCrits + ' body');
                damageBracketUnarmored.textContent = shotsText.join(' + ');
                damageBracket.appendChild(damageBracketUnarmored);
            }

            let damageBracketTTK = document.createElement('span');
            damageBracketTTK.setAttribute('class', 'time-to-kill');
            damageBracketTTK.textContent = TTK + " 秒";
            damageBracket.appendChild(damageBracketTTK);

            const reloadCount = Math.floor((totalShotsToKill - 1) / (MagSizenum));
            if (reloadCount >= 1) {
                let damageBracketReloads = document.createElement('span');
                damageBracketReloads.setAttribute('class', 'time-to-kill');
                damageBracketReloads.textContent += `${reloadCount} ${reloadCount != 1 ? '次装填' : '次装填'}`
                damageBracket.appendChild(damageBracketReloads);
            }
        }

        // Populate the damage chart with enemy name and stats
        let damageStatsEnemy = document.createElement('div');
        damageStatsEnemy.setAttribute('class', 'damage-stats-enemy');

        let damageStatsEnemyName = document.createElement('h2');
        damageStatsEnemyName.setAttribute('class', 'enemy-name');
        damageStatsEnemyName.textContent = enemyName;
        damageStatsEnemy.appendChild(damageStatsEnemyName);

        let damageStatsEnemyArmor = document.createElement('span');
        damageStatsEnemyArmor.setAttribute('class', 'enemy-armor');
        damageStatsEnemyArmor.textContent = enemyData[enemyName].Armor + " 护甲";
        damageStatsEnemy.appendChild(damageStatsEnemyArmor);

        let damageStatsEnemyHealth = document.createElement('span');
        damageStatsEnemyHealth.setAttribute('class', 'enemy-health');
        damageStatsEnemyHealth.textContent = enemyData[enemyName].Health + " 生命值";
        damageStatsEnemy.appendChild(damageStatsEnemyHealth);

        if (enemyData[enemyName].ArmorHardness) {
            let damageStatsEnemyHardness = document.createElement('span');
            damageStatsEnemyHardness.setAttribute('class', 'enemy-armor-hardness');
            damageStatsEnemyHardness.textContent = enemyData[enemyName].ArmorHardness + " 护甲硬度";
            damageStatsEnemy.appendChild(damageStatsEnemyHardness);
        }

        statDisplay.appendChild(damageStatsEnemy);

        // Set CSS variables for weapon and enemy background images
        damageStats.style.setProperty('--weapon-image', `url("images/weapons/${selectedWeapon}.jpg")`);
        damageStats.style.setProperty('--enemy-image', `url("images/enemies/${enemyName}.jpg")`);

        damageStats.appendChild(statDisplay)

        damageStats.style.transitionDelay = (currentCard++ * 0.03) + 's';
        damageStats.style.transform = 'scale(0.95)';
        setTimeout(() => {
            damageStats.style.transform = 'scale(1)';
        });
    }

    document.querySelector('#selected-weapon')
        .style.setProperty('--weapon-image', `url("images/weapons/${selectedWeapon}.jpg")`);
}
function updateMagsize(selectedWeapon){
    
    weapon = weaponData[selectedWeapon];
    var select = document.getElementById("Magazine-selector");
    var Magtype = select.selectedIndex;
    
    switch(select[Magtype].value){
      case "默认":
        document.querySelector('#weapon-mag-size-stat')
          .textContent = weapon.AmmoLoaded ?? 10;
        
        //return MagSizenum;
        break;
      case "扩容":
        document.querySelector('#weapon-mag-size-stat')
          .textContent = weapon.EAmmoLoaded ?? 10;
        
        //return MagSizenum;
        break;
      case "紧凑":
        document.querySelector('#weapon-mag-size-stat')
          .textContent = weapon.CAmmoLoaded ?? 10;
        
        //return MagSizenum;
        break;
      case "快拔":
        document.querySelector('#weapon-mag-size-stat')
          .textContent = weapon.QAmmoLoaded ?? 10;
        
        //return MagSizenum;
        break;
    }
    switch(weapon.name){
        default:
            if (weapon.AmmoPickup.Min == weapon.AmmoPickup.Max)
            document.querySelector('#weapon-ammo-pickup-stat')
                .textContent = weapon.AmmoPickup.Max;
            else{
            document.querySelector('#weapon-ammo-pickup-stat')
                .textContent = `${weapon.AmmoPickup.Min ?? 5}-${weapon.AmmoPickup.Max ?? 10}`;
            };
            break;
        case "Ziv Commando":
        case "SG Compact-7":
        case "FIK PC9":
            if(select[Magtype].value == "快拔"){
                document.querySelector('#weapon-ammo-pickup-stat')
                .textContent = `${weapon.QAmmoPickup.Min ?? 5}-${weapon.QAmmoPickup.Max ?? 10}`;
            }else{
                document.querySelector('#weapon-ammo-pickup-stat')
                .textContent = `${weapon.AmmoPickup.Min ?? 5}-${weapon.AmmoPickup.Max ?? 10}`;
            };
            break;
        case "FIK 22 TLR":
        case "FSA-12G":
        case "WAR-45":
        case "RG5":
        case "ATK-7":
            if(select[Magtype].value == "紧凑"){
                document.querySelector('#weapon-ammo-pickup-stat')
                .textContent = `${weapon.CAmmoPickup.Min ?? 5}-${weapon.CAmmoPickup.Max ?? 10}`;
            }else{
                document.querySelector('#weapon-ammo-pickup-stat')
                .textContent = `${weapon.AmmoPickup.Min ?? 5}-${weapon.AmmoPickup.Max ?? 10}`;
            };
            break;

    }
}
function updateWeaponStats(
    selectedWeapon
) {
    const weapon = weaponData[selectedWeapon];
    
    const damageStats = document.querySelector('#weapon-damage-stats'),
          critStats = document.querySelector('#weapon-crit-stats');

    damageStats.innerHTML = '';

    weapon.DamageDistanceArray.forEach(distance => {
        const weaponDamageRow = damageStats.appendChild(document.createElement('tr'));

        const weaponDamageDistance = weaponDamageRow.appendChild(document.createElement('td'));
        weaponDamageDistance.setAttribute('class', 'weapon-stat-distance');
        weaponDamageDistance.textContent = distance.Distance / 100 + '米';

        const weaponDamageStat = weaponDamageRow.appendChild(document.createElement('td'));
        weaponDamageStat.setAttribute('class', 'weapon-stat');
        weaponDamageStat.textContent = Math.round(distance.Damage * 10) / 10;

        if (weapon.ProjectilesPerFiredRound && weapon.ProjectilesPerFiredRound > 1) {
            const weaponPelletCount = weaponDamageStat.appendChild(document.createElement('span'));
            weaponPelletCount.setAttribute('class', 'weapon-pellet-count');
            weaponPelletCount.textContent += `×${weapon.ProjectilesPerFiredRound}`
        }
    });

    critStats.innerHTML = '';

    weapon.CriticalDamageMultiplierDistanceArray.forEach(distance => {
        const weaponCritRow = critStats.appendChild(document.createElement('tr'));

        const weaponCritDistance = weaponCritRow.appendChild(document.createElement('td'));
        weaponCritDistance.setAttribute('class', 'weapon-stat-distance');
        weaponCritDistance.textContent = distance.Distance / 100 + '米';
    
        const weaponCritStat = weaponCritRow.appendChild(document.createElement('td'));
        weaponCritStat.setAttribute('class', 'weapon-stat');
        weaponCritStat.textContent = distance.Multiplier + "倍";
    });

    document.querySelector('#weapon-rpm-stat')
        .textContent = weapon.RoundsPerMinute ?? 600;

    document.querySelector('#weapon-ap-stat')
        .textContent = weapon.ArmorPenetration;
        
    
}

const skills = {
    'edge': {
        name: '锋锐',
        description: '20秒内你的伤害增加10%。',
        requiresEdge: false,
        damageMultiplier: 0.1
    },
    'longshot': {
        name: '百步穿杨',
        description: '当你通过瞄具瞄准时，你的爆头倍率将不会附加距离惩罚。',
        requiresEdge: true
    },
    'facetoface': {
        name: '近身缠斗',
        description: '当你拥有锋锐与坚毅状态时，对距离你5米范围内的目标造成10%额外伤害。',
        requiresEdge: true,
        damageMultiplier: 0.1
    },
    'coupdegrace': {
        name: '恩赐解脱',
        description: '你的射击对瘫痪的敌人造成10%额外伤害。',
        requiresEdge: true,
        damageMultiplier: 0.1
    },
    'combatmarking': {
        name: '战斗标记',
        description: '你对被标记的敌人额外造成20%伤害。',
        requiresEdge: true,
        damageMultiplier: 0.2
    },
    'painasymbolia': {
        name: '无痛症',
        description: '锋锐、坚毅、疾驰的效果翻倍。',
        requiresEdge: true,
        damageMultiplier: 0.1
    },
    'highgrain': {
        name: '重磅弹头',
        description: '与任意放置的弹药包互动后你和你的队友获得0.2穿甲系数。',
        requiresEdge: false,
        armorPenetrationModifier: 0.2
    },
    'Expose': {
        name: '破绽百出',
        description: '向被你的闪光弹或电击手雷影响的敌人开枪射击时，在其眩晕期间无视其护甲。',
        requiresEdge: false
    }
}

const edgeSkills = Object.keys(skills).filter(skill => skills[skill].requiresEdge);
console.log(edgeSkills);

initialiseWeaponData();

const skillButtons = document.querySelectorAll('button.weapon-skill');
const edgeSkillButtons = [...skillButtons].filter(skillButton => {
    return (edgeSkills.includes(skillButton.value));
});

// Initialise the damage chart with defaults
const weaponSelector = document.querySelector('#weapon-selector');
const MagazineSelector = document.querySelector('#Magazine-selector');
let selectedWeapon = weaponSelector.options[weaponSelector.selectedIndex].value,
    selectedSkills = [];



updateWeaponStats(selectedWeapon);
initialiseMagazineData(selectedWeapon);
updateMagsize(selectedWeapon);
updateDamageData(selectedWeapon, selectedSkills,);

// Add event listeners for weapon selector and buttons to update damage chart

weaponSelector.addEventListener("change", (event) => {
    selectedWeapon = event.target.options[event.target.selectedIndex].value;
    initialiseMagazineData(selectedWeapon);
    updateMagsize(selectedWeapon)
    updateDamageData(selectedWeapon, selectedSkills,);
    updateWeaponStats(selectedWeapon);
	
    

});
MagazineSelector.addEventListener("change", (event) => {
    updateMagsize(selectedWeapon);
    updateDamageData(selectedWeapon,selectedSkills,)
});
weaponSelector.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
});

for (const button of skillButtons) {
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (event.target.disabled) return;
        
        if (event.target.getAttribute('aria-pressed') == 'false') {
            event.target.setAttribute('aria-pressed', 'true');
        }
        else {
            event.target.setAttribute('aria-pressed', 'false');
        }

        if (event.target.value == 'edge') {
            if (event.target.getAttribute('aria-pressed') == 'true') {
                for (const edgeSkill of edgeSkillButtons) {
                    edgeSkill.removeAttribute('disabled');
                }
            }
            else {
                for (const edgeSkill of edgeSkillButtons) {
                    edgeSkill.setAttribute('disabled', '');
                    edgeSkill.setAttribute('aria-pressed', 'false');
                }
            }
        }

        const pressedButtons = Array.from(skillButtons)
            .filter(i => i.getAttribute('aria-pressed') == 'true')
            .map(i => i = i.value);
        selectedSkills = pressedButtons;

        updateDamageData(selectedWeapon, selectedSkills,);
    });
}