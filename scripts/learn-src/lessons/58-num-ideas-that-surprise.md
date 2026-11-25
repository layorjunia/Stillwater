@series num
@conf solid

# The birthday paradox
@src Standard probability; Mises, 1939

How many people do you need in a room before there's a better than even chance that two of them share a birthday? Most people guess at around a hundred and eighty, half the number of days in a year. The answer is twenty-three. With twenty-three people, the chance is about fifty-one percent. With fifty-seven people, it's about ninety-nine percent.

The surprise comes from counting pairs, and not people. In a group of twenty-three, there are two hundred and fifty-three different pairs of people, and each pair has a small chance of matching. Those chances add up fast. The idea matters outside parties. It explains why random codes and identifiers can collide much sooner than expected, a fact used in the design of computer security systems.

# The rule of 72
@src Standard finance; Pacioli, Summa de arithmetica, 1494

If your money grows at a steady percentage each year, how long will it take to double? There's a shortcut. Divide seventy-two by the percentage rate, and the answer is roughly the number of years. At six percent, it takes about twelve years. At nine percent, about eight years. At two percent, thirty-six years.

The rule works because of the mathematics of compound growth, and it's accurate for rates from about two to ten percent. It appeared in print in 1494, in a book by the Italian mathematician Luca Pacioli, though it may be older. It works in reverse for anything that grows or shrinks by a steady rate, such as the price of goods with inflation, or a population. At three percent inflation, prices double in about twenty-four years.

# Folding a piece of paper
@src Standard exponential growth; Pomerance, 2002

Take a sheet of paper that is a tenth of a millimeter thick. Fold it in half, and it's twice as thick. Fold it again, and four times. After seven folds, it's about as thick as a notebook. After ten, it is about a hand's width. After twenty-three folds, it's about as tall as a tall building. After forty-two folds, it would reach the Moon.

In practice, no one can fold paper more than about eleven or twelve times, as Britney Gallivan showed in 2002. She was a high school student who worked out the formula for how much paper you need, and folded a very long sheet twelve times. But the arithmetic of doubling is what matters. It shows how fast exponential growth takes off, and why we tend to underestimate it.

# The pigeonhole principle
@src Dirichlet, 1834

If you put eleven pigeons in ten holes, at least one hole must contain two pigeons. It's obvious, and it's also a powerful tool. It was named by the German mathematician Peter Dirichlet in the 1830s, who used it to prove results in number theory.

It can be used for some surprising conclusions. In any city with more people than there are possible numbers of hairs on a human head, at least two people must have exactly the same number of hairs. The number of hairs on a head is under a million, so in New York City, with millions of people, many must match. The principle doesn't tell you who they are. It proves they exist, which is the power of a simple counting argument.

# Pascal's triangle
@src Pascal, Traité du triangle arithmétique, 1654; Yang Hui, 1261

Start with a single one at the top. Then write rows below it, in which each number is the sum of the two numbers above it. The result is a triangle of numbers, one, one one, one two one, one three three one, and so on. It's named after Blaise Pascal, who wrote a treatise on it in 1654, but it was known earlier in China, India and Persia. In China it was called Yang Hui's triangle.

The numbers in each row are the coefficients that you get when you expand a binomial, such as the square of a plus b. They also count the number of ways to choose items from a set, and they appear in probability. If you shade the odd numbers, a fractal pattern called the Sierpinski triangle appears. The sums of the rows are the powers of two. A simple rule hides many patterns.

# Perfect numbers
@src Euclid, Elements, Book IX; Euler, 1747

A perfect number is a number that equals the sum of its proper divisors, the numbers that divide into it, not counting itself. Six is perfect, since one plus two plus three makes six. Twenty-eight is perfect too, since one, two, four, seven and fourteen add up to twenty-eight. The next are 496 and 8128. The ancient Greeks knew these four.

Euclid showed that whenever a certain kind of prime, called a Mersenne prime, exists, it gives a perfect number. In the eighteenth century, Euler proved that every even perfect number has this form. No one knows whether there are any odd perfect numbers, or whether the list goes on forever. It's one of the oldest unsolved problems in mathematics, and it has been open for over two thousand years.

# Hilbert's problems
@src Hilbert, Mathematical Problems, 1900

In August 1900 the German mathematician David Hilbert gave a lecture at the International Congress of Mathematicians in Paris. He described twenty-three problems that he thought would be important in the century to come. They ranged from the foundations of mathematics to number theory and geometry.

The list became a guide for research. Some problems have been solved, such as the tenth, about whether there's a general method of solving certain equations, which was shown to be impossible in 1970. Gödel's theorems, in 1931, answered a part of the second problem, about whether mathematics can be proved to be consistent. Others remain open, such as the Riemann hypothesis, the eighth. Hilbert ended his talk by saying that in mathematics there is no ignorabimus, no we shall not know.

# Why 0.999 is 1
@src Standard real analysis

Does 0.999 with an endless string of nines equal one? Many people feel that it falls a little short. It's a famous puzzle, and the answer is that they are exactly equal. There are several ways to see this. One is that one third is 0.333 repeating, and three times one third is one, but also three times 0.333 repeating is 0.999 repeating.

Another way is to call x the number 0.999 repeating. Then ten times x is 9.999 repeating, and subtracting x gives nine times x equals nine, so x is one. A third way uses the idea of a limit. The number is defined as the limit of the sequence 0.9, 0.99, 0.999, and that limit is one. The feeling that something is missing comes from thinking of the nines as a process that never finishes, not as a number.

# The St. Petersburg paradox
@src Bernoulli, Commentarii Academiae Scientiarum Imperialis Petropolitanae, 1738

Here is a game. A fair coin is tossed until it lands heads. If heads comes up on the first toss, you win two dollars. If it takes two tosses, you win four dollars, then eight, sixteen and so on, doubling each time. How much would you pay to play?

The expected value is infinite, since each possible outcome adds one dollar to the average, and there are infinitely many. Yet most people would pay only a few dollars. In 1738 Daniel Bernoulli proposed a solution. The value of money to a person is not the same as its amount. An extra dollar matters less to a rich person than to a poor one. This idea of diminishing utility became a foundation of economics, and of the study of how people choose under risk.

# Bayes and his theorem
@src Bayes & Price, Philosophical Transactions, 1763

Thomas Bayes was an English minister and mathematician who lived from 1701 to 1761. He published little in his life. After he died, his friend Richard Price found a paper among his things, and sent it to the Royal Society, which printed it in 1763. In it, Bayes showed how to work out the probability of a cause, given an effect.

The rule says that you should start with a prior belief, and then update it by how well the new evidence fits each possibility. If a test is positive, the chance that you really have the condition depends on how common the condition is, and on how accurate the test is. The idea was neglected for a long time, and then revived in the twentieth century. It is now central to statistics, to machine learning, and to the way that we think about evidence.

# Epidemics and the number R
@src Kermack & McKendrick, Proceedings of the Royal Society A, 1927

In 1927 two Scottish scientists, William Kermack and Anderson McKendrick, published a model of how an infectious disease spreads. People are divided into three groups, susceptible, infected and recovered. The model uses simple equations to show how many people move from one group to the next. It is called the SIR model.

A key number in the model is the basic reproduction number, called R-naught. It's the average number of people that one infected person infects in a population with no immunity. If it's greater than one, the disease spreads. If it's less than one, it dies out. The model also shows that an epidemic ends before everyone has been infected, because the number of susceptible people falls. Versions of it were used to guide decisions in the COVID-19 pandemic.

# The logistic map and chaos
@src May, Nature, 1976

In 1976 the biologist Robert May published a short paper on a very simple equation. It describes how a population changes from one year to the next, with growth limited by a lack of resources. The next population equals a growth rate times the current population times one minus the current population. A child could use it with a calculator.

May found that the behavior depends on the growth rate. At low rates, the population settles at a steady level. At higher rates, it bounces between two values, then four, then eight, and at still higher rates it becomes chaotic, with no pattern at all. A simple rule, with nothing random, can produce behavior that looks random. His paper helped to spread the study of chaos, and it showed that unpredictability doesn't need complexity.

# The Game of Life
@src Gardner, Scientific American, 1970

In 1970 the mathematician John Conway invented a game with no players. It is played on a grid of squares, each of which is alive or dead. At each step, a few rules decide what happens. A live cell with two or three live neighbors survives. A dead cell with exactly three live neighbors comes to life. All others die or stay dead.

From these rules, complex patterns emerge. Some patterns stay still. Some oscillate, and some, called gliders, move across the grid. People have built patterns that act like computers, and which can calculate anything that a computer can. Martin Gardner described the game in Scientific American, and it became a craze. It's often used as an example of how complexity and life-like behavior can come from simple rules.

# Euler's formula for solids
@src Euler, 1758

Take a solid with flat faces, such as a cube. It has eight corners, twelve edges and six faces. Count the corners minus the edges plus the faces, and you get eight minus twelve plus six, which is two. Try a pyramid with a square base. It has five corners, eight edges and five faces, and five minus eight plus five is again two.

Leonhard Euler noticed in 1750 that this works for any solid without holes, so that the corners minus the edges plus the faces is always two. It was one of the first results in topology, the study of shapes that stay the same when stretched. For a donut shape, which has a hole, the number is zero. The count gives you a way of telling shapes apart without measuring anything.

# The five solids
@src Plato, Timaeus; Euclid, Elements, Book XIII

There are exactly five solids whose faces are identical regular polygons, with the same number meeting at each corner. They are the tetrahedron, with four triangles, the cube, with six squares, the octahedron, with eight triangles, the dodecahedron, with twelve pentagons, and the icosahedron, with twenty triangles. They are called the Platonic solids.

The Greeks knew them well. Plato linked four of them to the elements, fire, earth, air and water, and the fifth to the heavens. In the last book of the Elements, Euclid proved that there can be no others. The reason is that at each corner, the angles must add up to less than a full circle. Kepler, in 1596, tried to explain the orbits of the planets by nesting the five solids inside one another. It was a wrong idea, but a beautiful one.

# Packing oranges
@src Hales, Annals of Mathematics, 2005

If you want to stack oranges as tightly as possible, how should you do it? Grocers know the answer. You arrange them in layers, with each orange sitting in the hollow between three below. It fills about seventy-four percent of the space. In 1611 Johannes Kepler stated that no arrangement of equal spheres could do better. It is called the Kepler conjecture.

No one could prove it for almost four hundred years. In 1998 Thomas Hales announced a proof that used a lot of computer calculations. The referees of the journal spent years on it, and said that they were ninety-nine percent sure it was right, but couldn't check it all. In 2014 a team led by Hales completed a formal proof, checked by software. It's a story of how the nature of proof has changed.

# The word googol
@src Kasner & Newman, Mathematics and the Imagination, 1940

A googol is the number one followed by a hundred zeros. The word was made up in 1920 by Milton Sirotta, who was nine years old. He was the nephew of the American mathematician Edward Kasner, who asked him for a name for a very big number. Kasner used it in a book in 1940.

Kasner also proposed a bigger number, the googolplex, which is one followed by a googol of zeros. It's so large that you couldn't write it down, even if you used every atom in the observable universe for a digit. The search engine Google took its name from the word, with a different spelling, in 1998, to suggest the vast amount of information on the web. A googol is bigger than the number of atoms in the observable universe, which is about ten to the eightieth power.

# The largest known prime
@src Great Internet Mersenne Prime Search, 2024

In October 2024 a retired engineer named Luke Durant announced the discovery of the largest known prime number. It's two raised to the power 136,279,841, minus one. It has more than forty-one million digits. Printed in a normal size, it would fill many thousands of pages. It's a Mersenne prime, a prime of the form two to a power minus one.

Durant found it using graphics processors rented in cloud data centers around the world. Previous records were mostly found by volunteers using their own computers, through the Great Internet Mersenne Prime Search. There is a prize from the Electronic Frontier Foundation for the first prime with over a hundred million digits. The primes are infinite, as Euclid showed, so there will always be a larger one.
