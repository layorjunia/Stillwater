@series tech
@src Standard computer science references, named per card
@conf solid

# The bit
@src Shannon, 1948

A bit is the smallest piece of information there is: a single choice between two possibilities, a zero or a one. It might be a light that is on or off, or a coin that is heads or tails. In 1948 the engineer Claude Shannon published a paper that used the bit as the basic unit for measuring information, and his colleague John Tukey is credited with coining the word, from "binary digit."

Everything in a computer, from a letter to a photograph, is built from long strings of bits. Eight bits make a byte, which can hold 256 different values, enough for one letter of text. A song or a movie is simply a very large number of bytes. The idea that all information can be counted in the same units was one of the great insights of the twentieth century.

# Unicode and emoji
@src Unicode Consortium; Kurita, 1999

Computers store text as numbers, and for years, different systems used different codes, which made text turn to garbage when moved between them. ASCII, from 1963, had only 128 characters, enough for plain English. Unicode, begun in 1991, set out to give every character in every writing system its own number. It now covers more than 150,000 characters, from Chinese and Arabic to ancient scripts and emoji.

The first set of emoji, 176 of them, was created in 1999 by Shigetaka Kurita, a designer working on a mobile internet service in Japan. Each was drawn on a tiny grid of 12 by 12 pixels. They were meant to convey things like weather and traffic quickly on small screens. The original set is now in the permanent collection of the Museum of Modern Art in New York, and Unicode is what lets a smiley face look the same on your phone and mine.

# Algorithms and Big O
@src Knuth, The Art of Computer Programming

An algorithm is a precise, step-by-step method for solving a problem, one that's clear enough that it can be followed without any guesswork. The word comes from the name of the Persian mathematician al-Khwarizmi. A cooking recipe, a method of sorting names alphabetically and the way your phone finds a route all count. What matters is that each step is unambiguous and that the procedure ends.

Programmers use "Big O" notation to describe how a program's running time grows as the amount of data grows. Imagine sorting a million items. A simple method that compares every item with every other takes time proportional to n squared, about a trillion steps. A cleverer method, taking time proportional to n times the logarithm of n, needs only about 20 million. At scale, the choice of method matters far more than the speed of the computer.

# Compilers and interpreters
@src Hopper, 1952

Computers can only run machine code, which is long strings of numbers, so a human-friendly program has to be translated. A compiler translates the whole program in advance and produces a file that the computer can run directly. An interpreter reads and carries out the program line by line as it goes.

Grace Hopper wrote an early compiler in 1952, and many people at the time thought that the idea was impossible, since they believed that computers could only do arithmetic. C is typically compiled, Python is usually interpreted, and many systems use a mixture. Compiled programs tend to run faster, and interpreted ones are often easier to test and change. Between them, the two ideas let people write in something close to ordinary language.

# The operating system
@src Ritchie & Thompson, 1974

The operating system is the program that sits between your applications and the hardware. It decides which program gets the processor, manages memory, files and devices, and gives each application a safe place to run. Without it, every program would need to know the details of every device.

Unix appeared at Bell Labs in 1969, and many later systems, including macOS, were built on its ideas. In 1991 a Finnish student, Linus Torvalds, began writing Linux, whose kernel now runs most of the world's servers and Android phones. Windows, macOS, Linux and Android are all operating systems. You rarely notice yours when it works, and it's one of the largest and most complicated pieces of software that you use every day.

# The CPU, the GPU and memory
@src Standard architecture text; Hopper, lectures

The central processor is the part of a computer that carries out instructions, and its speed is measured in how many cycles it completes each second. A 3 gigahertz chip ticks three billion times a second. In one tick, light travels only about 10 centimeters. In one billionth of a second, it travels about a foot, and Grace Hopper used to hand out pieces of wire cut to that length to show why speed is limited. A signal can't cross a large machine in less time than that, so processors have to be tiny.

A graphics processor, or GPU, was designed to draw video game images, which involves doing the same simple calculation for millions of pixels at once. A CPU has a few powerful cores that do one thing after another, and a GPU has thousands of small cores that work at the same time, which suits training neural networks. Memory comes in layers. The processor's own cache takes about a nanosecond to read, RAM is about a hundred times slower, and a solid-state drive, which keeps data permanently, is about a thousand times slower again.

# The transistor and Moore's law
@src Bell Labs, 1947; Moore, 1965
@conf mixed

A transistor is a tiny electronic switch with no moving parts. John Bardeen and Walter Brattain built the first one at Bell Labs in December 1947, and William Shockley improved the design, and the three shared a Nobel Prize in 1956. It replaced the bulky, hot and unreliable vacuum tube. A modern chip contains tens of billions of them, and the largest hold over 100 billion.

In 1965 Gordon Moore, who later cofounded Intel, noticed that the number of transistors that could be put on a chip was doubling regularly, and predicted that it would continue. In 1975 he revised the pace to about every two years. It held for decades, and made computers ever faster and cheaper. It has been slowing in recent years, as the parts get close to the size of only a few atoms. It's not a law of nature, but a prediction that came true because an industry worked to make it so.

# The internet and the web
@src Cerf & Kahn, 1974

People often use the two words as if they meant the same, but they don't. The internet is the global network of connected computers, which began as a standard way for networks to talk when the TCP/IP protocol was adopted on January 1, 1983. It was a "flag day," on which every computer on the network had to switch to the new method at the same time.

The World Wide Web is a system of linked pages and sites that runs on top of the internet. It was created by Tim Berners-Lee in 1989 and 1990. Email, online games, video calls and many smartphone apps use the internet but not the web. A helpful way to think of it is that the internet is the road system, and the web is one kind of traffic that travels on it. The web is the part you see in your browser.

# Packets, addresses and cables
@src Baran, 1964; Davies, 1966; Mockapetris, 1983; TeleGeography

The internet doesn't send a message as one continuous stream. It breaks it into small packets, each of which finds its own way across the network and is reassembled at the other end. The idea was developed in the 1960s by Paul Baran in the US and Donald Davies in Britain. It makes the network robust, because if one route fails, the packets just take another. Every device on the internet has a numerical address, like 142.250.80.46, but nobody wants to remember those. The Domain Name System, invented by Paul Mockapetris in 1983, works like a phone book, looking up the number for each website name that you type.

It feels like the internet is in the air, but about 99 percent of international data travels through cables lying on the ocean floor. There are hundreds of them, adding up to well over a million kilometers, and they link all the continents except Antarctica. Each carries many fibers and is only about as thick as a garden hose. Ships' anchors and fishing nets are the main hazards.

# The padlock and public-key encryption
@src Diffie & Hellman, 1976; Standard web security guidance

The padlock in your browser's address bar means that the connection between your browser and the website is encrypted, so that nobody in between can read or alter what you send. It doesn't mean the site is trustworthy. Scammers can get the padlock for fake sites, too. It's wise to check the address itself, and to be careful about links in messages, whether or not you see a padlock.

The encryption behind it rests on a clever idea. How can you send a secret to someone you've never met, without first sharing a secret key? Whitfield Diffie and Martin Hellman published an answer in 1976, and in 1977 Rivest, Shamir and Adleman created the RSA method. Each person has two keys, a public one to lock messages and a private one to unlock them. British codebreakers at GCHQ had found the idea earlier, but it was kept secret until 1997.

# Hashing and passwords
@src Standard cryptography text; NIST SP 800-63B

A hash function turns any piece of data into a short, fixed-length fingerprint. It's easy to compute, and practically impossible to reverse. Change even one letter of the input, and the hash changes completely. Websites should store hashes of your password, not the password itself, so that even if the database is stolen, the passwords aren't directly revealed. Hashes are also used to check that a file hasn't been altered.

For years we were told to use short passwords with symbols and numbers, and to change them often. The US National Institute of Standards and Technology revised its advice in 2017. It recommended against forced regular changes and strange character requirements, since they push people into predictable patterns. Instead, long passphrases are better, and passwords should be checked against lists of known leaked ones. Length beats complexity, and a password manager is the best way to keep a different one for every site.

# Two-factor authentication and phishing
@src Thomas et al., Google, 2019; Verizon DBIR, 2023

A password is something you know. A second factor is something you have, like your phone, or something you are, like a fingerprint. A 2019 study by Google found that even a simple text-message code blocked 100 percent of automated bot attacks, 96 percent of bulk phishing attacks and 76 percent of targeted attacks. App prompts and security keys did even better. It's one of the best things you can do to protect an account.

Phishing is when an attacker sends a message that looks like it's from a bank, a delivery company or a coworker, to trick you into giving up a password or sending money. In Verizon's 2023 report on data breaches, about 74 percent involved a human element, such as a mistake, stolen credentials or social engineering. The best defense is to slow down, and to go to the real website yourself, instead of clicking the link.

# Email, the @ sign and the first spam
@src Tomlinson; Brunton, Spam (2013)

In 1971 Ray Tomlinson, an engineer working on ARPANET, sent the first email between two computers, and chose the @ sign to separate the user's name from the computer's name. He picked it because it was on the keyboard and wasn't used in anyone's name. He later said the test message was probably something like "QWERTYUIOP," and that he couldn't remember exactly.

On May 3, 1978, Gary Thuerk, a marketer at Digital Equipment Corporation, sent an advertisement for a new computer to about 400 people on ARPANET, the forerunner of the internet. Many recipients were annoyed. The word "spam" for unwanted messages came later, from a Monty Python sketch in which the word is repeated over and over until it drowns out everything else. The two stories, from only seven years apart, tell us that the same technology gives us both.

# The cloud and the API
@src Standard computing text; Fielding, 2000

"The cloud" is a friendly name for other people's computers. Instead of buying and running their own servers, companies and individuals rent computing power and storage over the internet from big data centers, paying for what they use. Amazon launched its cloud services in 2006. When you store photos online or stream a movie, they're sitting in a data center somewhere, probably far from you.

An API, or application programming interface, is a set of rules that allows one program to ask another for something. It's like a waiter in a restaurant: you order from a menu, the waiter takes your request to the kitchen, and brings back the food. You never have to go into the kitchen yourself. When a weather app shows a forecast, it probably asks a weather service's API for the data. Much of the modern internet is made of programs asking each other for things in this way.

# Relational databases
@src Codd, 1970

In 1970 Edgar Codd, a researcher at IBM, proposed storing data in simple tables of rows and columns that can be linked to each other by shared values. A table of customers, for example, could be linked to a table of orders by a customer number. It was a big change from earlier, more tangled systems.

A query language called SQL grew from his idea, and it still underlies most business software today, from bank records to online shopping. IBM was slow to build on Codd's idea, and a smaller company, Oracle, was among the first to sell a product based on it. The simplicity of the tables is the reason it lasted. A system that can answer almost any question about data by combining a few simple operations has proved hard to improve on.

# Version control and open source
@src Torvalds, 2005; Open Source Initiative

Version control software keeps a record of every change made to a set of files, who made it, and when, so that you can go back to any earlier version. Linus Torvalds created Git in 2005, in about two weeks, after a dispute over the tool that the Linux project had been using. Git lets thousands of people work on the same project at once, and merge their changes.

Open-source software is software whose code is publicly available for anyone to read, use, modify and share. The term was chosen in 1998. Much of the internet runs on it: Linux powers most web servers, and the Android phone system is built on it. Wikipedia, begun in 2001, applied a similar spirit of open, collaborative work to encyclopedias. The two ideas together made it possible for strangers around the world to build large and reliable systems.

# Ariane 5 and Knight Capital
@src Lions, ESA inquiry, 1996; SEC, 2013

On June 4, 1996, the first Ariane 5 rocket, built by the European Space Agency, veered off course and blew up 37 seconds after launch. The cause was a software bug. A program reused from the older Ariane 4 tried to squeeze a large number into a space that was too small for it. That caused a shutdown of the guidance system. The rocket and its cargo were worth about $370 million.

On August 1, 2012, the trading firm Knight Capital installed new software on its servers but, by mistake, put it on only seven of its eight machines. The eighth still had old code, which started buying and selling stocks wildly. In 45 minutes the firm lost about $440 million, nearly all of its capital, and it nearly went out of business. In both cases, a small, ordinary mistake did enormous damage.

# Y2K and 2038
@src Standard computing history

Many old computer programs stored years as two digits, so that 2000 would look like 1900. It set off a worldwide effort to repair them, which cost hundreds of billions of dollars, and when the new year arrived in 2000, most systems worked. Some people have since said that the problem was exaggerated, but the smooth outcome was the result of a great deal of hard work.

A similar problem looms for systems that count seconds from 1970 in a 32-bit number. It will run out on January 19, 2038, and older systems will need to be fixed. Most modern computers use larger numbers and won't be affected, but there may be old equipment, in factories and other places, that has to be found and updated. The lesson in both cases is that a shortcut taken to save space can come back to cost much more later.

# Therac-25
@src Leveson & Turner, 1993

The Therac-25 was a radiation therapy machine used in hospitals in the 1980s. Between 1985 and 1987 it delivered massive overdoses to at least six patients, and at least three of them died. The patients were being treated for cancer, and they were hurt by the very machine that was meant to help them.

The software had a flaw called a race condition, which occurred when an operator typed quickly, and the older hardware safety locks, which would have stopped it, had been removed. The error message was cryptic, and the operators learned to ignore such messages. It's a classic case study in software safety, which engineers study to this day. It teaches that a safety system should not depend on software alone, and that when something goes wrong, it's vital to listen to reports of problems.

# The Hyatt Regency walkway
@src Moncarz & Taylor, 2000

On July 17, 1981, two suspended walkways in the lobby of the Hyatt Regency hotel in Kansas City collapsed during a dance, killing 114 people. It was one of the deadliest structural failures in US history, and the hotel was full of people.

The cause was a change to the design that was made during construction, in how the walkway rods were attached, which doubled the load on a critical connection. No one rechecked the calculations. The engineers involved lost their licenses. It's a standard example in engineering ethics classes, because the change looked small and sensible. It shows how important it is to verify every change, and for people who are responsible for a design to take that responsibility seriously.
