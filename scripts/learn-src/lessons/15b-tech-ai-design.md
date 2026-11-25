@series tech
@src Standard computer science references, named per card
@conf solid

# Machine learning and neural networks
@src Samuel, 1959; Krizhevsky et al., 2012

Traditionally, programmers write rules telling a computer what to do. In machine learning, you show the program many examples and let it find the patterns itself. To make a spam filter, for instance, you show it thousands of spam and non-spam emails. Arthur Samuel used the term in 1959 for a checkers program that got better by playing against itself.

An artificial neural network is made up of layers of simple units, loosely inspired by brain cells, whose connections are adjusted during training. Frank Rosenblatt built an early one, the perceptron, in 1958. A 1986 paper by Rumelhart, Hinton and Williams showed how to train deeper networks. In 2012 a network called AlexNet cut the error rate in an image-recognition contest from 26 percent to 15 percent, and launched the modern deep-learning boom.

# Overfitting
@src Standard machine learning text

An overfitted model has memorized its training examples, including their quirks and errors, and so it does badly on new data. It's like a student who memorizes the answers to past exams without understanding the subject, and then fails when the questions change.

The remedy is to test the model on data it has never seen, and to keep the model from being more complicated than it needs to be. The same trap catches people too. If you explain a coincidence by inventing a detailed theory, you may be fitting the noise and not the pattern. The measure of an idea, whether in machine learning or in everyday thinking, is how well it works on cases that you haven't looked at yet.

# Training and inference
@src Standard machine learning text

There are two phases in an AI model's life. Training is the long, expensive process in which it learns from data, which for a large model can take weeks on thousands of specialized chips. Inference is using the finished model, such as when you ask it a question. That takes a fraction of a second.

Most of the cost of running a popular system comes from many people using it, rather than from the one-time training. A useful way to picture it is a person who goes to school for many years, and then uses what they've learned for the rest of their lives. The learning is slow and costly, and the using is quick. A model doesn't normally learn from your conversations once it's been trained, unless its builders choose to train it again.

# Bias in AI
@src Buolamwini & Gebru, 2018

An AI system learns from its training data, and if that data doesn't represent everyone, it can work much worse for some groups. In 2018 the researchers Joy Buolamwini and Timnit Gebru tested commercial face-analysis programs in the Gender Shades study.

The error rate was as high as 34.7 percent for darker-skinned women, compared with 0.8 percent for lighter-skinned men. The study led several companies to improve their systems. The problem wasn't malice. The programs had simply been trained on photographs that were mostly of lighter-skinned men. It's a reminder that a computer isn't automatically fair, and that those who build such systems have to test them on the people they'll serve.

# Large language models and tokens
@src Vaswani et al., 2017

A large language model is a program trained on enormous amounts of text to predict the next word, again and again, which lets it produce fluent writing, answer questions and carry on a conversation. Most are built on the transformer design introduced in the 2017 paper "Attention Is All You Need." They can be astonishingly capable, but fluent writing isn't the same as accurate writing.

A language model doesn't read letters or whole words. It reads chunks called tokens, and a token is roughly three-quarters of an English word. The model can only consider a certain amount of text at once, known as its context window. It's like the model's working memory. If something falls outside the window, the model can't see it, however important it was earlier in the conversation.

# Hallucination
@src Standard AI reference

When an AI language model states something false with complete confidence, such as a made-up quotation or a nonexistent book, it's called a hallucination. The reason is that these models produce text that's likely, given their training, rather than text that's been checked against facts.

It's wise to verify any names, numbers, quotes and citations that an AI gives you, particularly when it matters. The false answers often sound as sure and well written as the true ones, which is what makes them hard to catch. A model is a bit like a very well-read person who's always willing to answer, and who sometimes fills in a gap rather than say "I don't know." Builders are working to reduce this, but it hasn't been removed.

# The Turing test and ELIZA
@src Turing, 1950; Weizenbaum, 1966

In 1950 Alan Turing proposed an "imitation game": if a person chatting by text can't tell whether they're talking to a machine or a human, the machine could be said to think. He thought that this was a more useful question than asking whether a machine really thinks, which he found hard to define.

In 1966 Joseph Weizenbaum wrote ELIZA, a very simple program that rephrased what people typed, like a therapist. Some users became convinced that it understood them, an effect now known as the ELIZA effect. Weizenbaum was troubled by it, and spent much of his life warning about the way people project minds onto machines. The lesson still matters. A program that talks like a person need not understand like one.

# Deep Blue, AlphaGo and AlphaFold
@src Campbell et al., 2002; Silver et al., 2016; Jumper et al., 2021

In 1997 IBM's Deep Blue beat the world chess champion Garry Kasparov in a six-game match, the first time a computer beat a reigning champion under tournament conditions. The ancient game of Go was thought to be much harder for computers, because there are so many possible moves. But in 2016 Google DeepMind's AlphaGo beat the top player Lee Sedol four games to one.

A protein's function depends on its three-dimensional shape, which comes from how a chain of amino acids folds, and working it out by experiment can take months or years. Biologists had tried to predict it from the sequence for 50 years. In 2020 DeepMind's AlphaFold matched experimental accuracy for many proteins. Demis Hassabis and John Jumper shared the 2024 Nobel Prize in Chemistry, with David Baker, for this work.

# Blockchain
@src Nakamoto, 2008
@conf mixed

A blockchain is a shared record, kept by many computers, in which new entries are linked to the earlier ones so that no one can quietly change history. It works a bit like a ledger that everybody holds a copy of, so that any attempt to alter one copy would be noticed.

It was invented for Bitcoin, which was described in 2008 by a person or group using the name Satoshi Nakamoto. Nobody knows who that is. Beyond digital currencies, few uses have proved better than an ordinary database, so its broader value is still debated. Supporters point to its resistance to tampering, and critics point to its cost in energy and complexity. It's an interesting idea, and a good example of the need to ask whether a new technology really solves a problem.

# Quantum computing
@src Shor, 1994
@conf mixed

A quantum computer uses the strange effects of quantum physics, such as superposition, to tackle certain problems far faster than ordinary computers. It does not simply run all programs faster. It's only useful for particular kinds of problems, such as simulating molecules or breaking certain codes.

In 1994 Peter Shor showed that a large enough quantum computer could break the public-key encryption that protects much of the internet. Today's machines are small and error-prone, and such a computer doesn't exist yet. Researchers are already developing encryption that would resist it, and the US government has chosen standards for it. Whether and when a useful quantum computer arrives is still uncertain, and it's wise to be skeptical of dramatic claims.

# GPS
@src US Space Force

The Global Positioning System works by satellites that broadcast signals with the exact time. Your phone listens to several of them and, from the tiny differences in arrival times, works out how far it is from each. To fix its position in three dimensions and to correct its own clock error, it needs signals from at least four satellites.

The system is run by the US Space Force and is free for anyone to use. It depends on very precise atomic clocks on the satellites, and on corrections for the effects of Einstein's relativity, which would otherwise make the clocks drift by kilometers a day. It was first built for the military, and opened for civilian use, and now it helps people to find their way, and times banking systems and power grids.

# QR codes and the first barcode
@src Denso Wave; Smithsonian

The QR code was invented in 1994 by Masahiro Hara at the Japanese company Denso Wave, to track car parts in factories. It can hold much more than a traditional barcode, and it can be read from any angle. Built-in error correction means that a code can still be read even if up to about 30 percent of it is damaged or covered, which is why a code with a logo in the middle still works.

At 8:01 a.m. on June 26, 1974, at a Marsh supermarket in Troy, Ohio, a cashier scanned the first product with a barcode: a ten-pack of Wrigley's Juicy Fruit chewing gum. The pack is now in the Smithsonian's National Museum of American History. Barcodes were slow to catch on, but they went on to change how stores and warehouses track goods. Both inventions were made to solve plain, everyday business problems.

# Bluetooth and Wi-Fi: two names
@src Kardach, 2001; Wi-Fi Alliance

The wireless technology Bluetooth is named for Harald Bluetooth Gormsson, a Danish king who ruled around 960 and is said to have united Denmark and Norway. Engineers who were working on a standard to connect different devices chose the name, first as a code name, because the technology was meant to unite devices. The Bluetooth logo is a combination of the runic letters for H and B, his initials.

You might assume that Wi-Fi stands for "wireless fidelity," but it doesn't. In 1999 the industry group that certifies the technology hired a branding agency, Interbrand, to come up with a catchy name for what was technically called IEEE 802.11. Wi-Fi was chosen because it sounded like "hi-fi." The invented tagline "wireless fidelity" was used for a while, but it was never what the name meant. One name is old and historic, and the other is pure marketing.

# Hick's law and Fitts's law
@src Hick, 1952; Fitts, 1954

The more options you offer, the longer it takes a person to decide. In 1952 William Hick showed that decision time rises with the logarithm of the number of choices. It's a reason to keep menus short, and to group options into categories. A screen with twenty buttons will slow down most users compared with one that shows a few and tucks the rest behind a clear label.

The time it takes to reach a target depends on how far away it is and how big it is. Paul Fitts described the rule in 1954, while studying pilots' movements. It explains why buttons should be large, and why items at the edge or corner of a screen are easy to hit: the cursor can't go past the edge, so you can just fling it there. Good design uses both of these two old findings, and most people never notice.

# Dark patterns
@src Brignull, 2010

A dark pattern is a design trick that pushes people into doing something they didn't intend. The designer Harry Brignull coined the term in 2010. Examples include an unsubscribe link hidden in tiny gray type, boxes that are already ticked to add extras to your order, and countdown timers that reset when they reach zero.

Some regulators have begun to treat them as illegal. They work because most of us are busy and don't read everything, and so a company can count on a click that is made out of haste. Once you know the patterns, you can spot them. Look for pre-ticked boxes, for a cancel button that is harder to find than the buy button, and for messages that try to make you feel guilty if you say no.

# Conway's law and technical debt
@src Conway, 1968; Cunningham, 1992

In 1968 the computer scientist Melvin Conway observed that organizations tend to produce systems that mirror their own communication structure. His example: if four groups work on a compiler, you'll get a compiler with four passes. If departments in a company don't talk to each other, the software they build won't work smoothly together either. To fix the software, you may have to fix the organization.

In 1992 the programmer Ward Cunningham used a financial metaphor to describe the cost of shortcuts in software. Writing a quick fix now is like taking out a loan: you get speed today, but you pay interest later, in the form of code that's harder to change. That can be a smart trade-off if you pay it back soon. If you never do, the interest builds up until it's hard to make any progress.

# Premature optimization
@src Knuth, 1974

Donald Knuth wrote in 1974 that "premature optimization is the root of all evil," and it's become a famous warning to programmers. Making code fast before you know where the bottleneck is wastes time and often makes the code harder to read.

But the full quote is more balanced. He said that we should forget about small efficiencies 97 percent of the time, yet not pass up our opportunities in the critical 3 percent. The advice applies well beyond programming. Before you spend a lot of effort improving something, measure first, to find out which part is actually slow, or costly, or in the way. Often the real problem is somewhere other than where you thought.

# Rubber duck debugging
@src Hunt & Thomas, 1999

Programmers have a trick for finding bugs: explain your code, line by line, to a rubber duck on your desk. Saying the problem out loud forces you to state your assumptions, and often you notice the mistake in the middle of the explanation.

The practice was described in the 1999 book The Pragmatic Programmer, and a duck isn't required. A patient colleague or a pet also works. It's a small example of a larger truth. Explaining something to someone else, even a toy, makes you slow down and think clearly, and it shows you the gaps in your understanding. The same trick can help with writing, with decisions and with any puzzle that has you stuck.

# The Swiss cheese model and normal accidents
@src Reason, 1990; Perrow, 1984
@conf mixed

In 1990 the psychologist James Reason proposed picturing the defenses against accidents as slices of Swiss cheese, each with holes. A single hole doesn't lead to disaster, because the next slice blocks it. But sometimes the holes in several layers line up, and a hazard passes straight through. The lesson is to add more layers of defense, and to keep fixing the holes. It's used in aviation, medicine and many other fields.

After the Three Mile Island nuclear accident in 1979, the sociologist Charles Perrow argued in his 1984 book that in systems that are both very complex and tightly coupled, with no slack, some accidents are inevitable. Parts interact in ways that no one expected, and failures spread faster than anyone can respond. Not everyone agrees that this means accidents can't be reduced, but the idea has been very influential.

# Blameless postmortems
@src Beyer et al., Site Reliability Engineering (2016)

When something goes wrong, the natural reaction is to ask who was at fault. Engineering teams at companies such as Google and Etsy found that punishing people for mistakes made them hide problems, which made failures worse. Many now hold blameless postmortems, asking "how did our system allow this to happen?" instead of "whose fault was it?"

People report problems earlier, and the system gets safer. The idea is borrowed from aviation and medicine, where safety experts found that the people closest to a mistake are the best source of knowledge about how to prevent the next one. A blameless review doesn't mean that nobody is responsible. It means that the aim is to learn, and to fix the conditions that made the error easy to make.

# Lithium-ion batteries
@src Nobel Prize in Chemistry, 2019

The rechargeable batteries in phones, laptops and electric cars were developed over several decades. Stanley Whittingham made the first working lithium battery in the 1970s, John Goodenough doubled its voltage in 1980, and Akira Yoshino made a safe, practical version in 1985. Sony began selling them in 1991.

The three shared the 2019 Nobel Prize in Chemistry. Goodenough was 97 years old when he received it, the oldest person ever to win a Nobel Prize. Each of the three men solved a different part of the problem, and the result changed the way we live. Without light, powerful batteries, there would be no smartphones, and electric cars would be much less practical.

# The cost of solar power
@src IRENA, 2021

According to the International Renewable Energy Agency, the average cost of electricity from new utility-scale solar power fell by about 85 percent between 2010 and 2020. A mix of larger production, learning by doing and better manufacturing brought the cost down.

In many places, solar is now among the cheapest sources of new electricity, cheaper than building new coal or gas plants. A famous pattern, called a learning curve, shows that each time that the total amount of solar panels made doubles, the price falls by a fairly steady fraction. It's one of the most encouraging trends in the modern world, since cheap clean power helps both the planet and people's budgets.

# Apollo's computer
@src MIT Instrumentation Laboratory

The guidance computer that helped land astronauts on the Moon in 1969 had 2,048 words of erasable memory and 36,864 words of fixed memory, about 4 kilobytes of working memory in modern terms. It weighed about 32 kilograms. A modern phone has millions of times more memory.

It was reliable, and it famously handled a series of alarms during the Apollo 11 landing without crashing. The alarms were caused by extra data from a radar, which overloaded the computer, and its software was designed to drop less important tasks and keep the vital ones going. Margaret Hamilton led the team that wrote the software. It's an example of how careful design can do a great deal with very little.

# Stuxnet
@src Langner, 2011; Zetter, 2014

Stuxnet was a computer worm discovered in 2010 and designed to attack industrial equipment. It targeted centrifuges used to enrich uranium at an Iranian nuclear plant, making them spin out of control while showing normal readings to the operators.

It's widely believed to have been created by the United States and Israel, though neither has officially confirmed it. It was the first known digital weapon to cause physical damage. Its discovery showed that software can be used to break machines in the real world, and not only to steal data. Since then, protecting factories, power stations and other critical systems from such attacks has become a serious concern for governments and companies.
